/**
 * The Hak Pakai end reminders' schedule (spec, Notifications: "60, 30 and 7 days before, then weekly in the
 * masa tenggang", Scheduler; ticket 42): which reminder is due for which Hak Pakai today, and when to stop.
 * The messages themselves are Notifications' (`pengingatHakPakaiBerakhir`); this owns only the rule and the claim
 * that makes each reminder go out once.
 *
 * A worker tick (`tick(ctx, now)`, idempotent): within 08:00-20:00 WIB, for every Aktif or Kedaluwarsa fixed-term
 * Hak Pakai it counts the days between today (WIB) and the end date. Before the end date the due stage is the
 * smallest of 60, 30 and 7 days it has reached; after it, in the Masa Tenggang, the n-th week since the end date.
 * A stage is claimed in the database before it is announced. A tick that first sees a Hak Pakai late announces only
 * the latest stage it has reached, never the whole backlog. It stops for a Hak Pakai once a Perpanjangan is ordered
 * for its current end date, once it is Berakhir, and once the Masa Tenggang is over; Perpanjangan payment moves the end
 * date, which starts a fresh schedule.
 *
 * "Nearing its end" for the Telepon Pemesan row (ADR 0004, not fixed there; settled here): the 7-day reminder and
 * every reminder after it (the Masa Tenggang's weeks) open the call row, the 60 and 30-day ones do not; a Hak Pakai
 * with no recorded email gets the row with any reminder. One open row per Hak Pakai, whoever opens it.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import { dalamJamKirim, type Notifications } from "@/domain/notifications";
import { labelSatuanHakPakai } from "@/lib/hak-pakai-akhir-labels";
import { addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import { perpanjangan, perpanjanganPengingat } from "./schema";

/** The days before the end date a reminder goes out on, earliest first. */
export const HARI_PENGINGAT = [60, 30, 7] as const;

export interface PengingatDeps {
  db: Database;
  inventory: Pick<Inventory, "hakPakaiMenjelangAkhir" | "hakPakaiUntukPerpanjangan">;
  lokasi: Pick<Lokasi, "aturanPerpanjanganOf">;
  identity: Pick<Identity, "adminLokasiOf">;
  /** Whether an ordered Perpanjangan's Tagihan is still alive (a lapsed one no longer stops the reminders). */
  billing: Pick<Billing, "tagihanBerlaku">;
  notifikasi: Pick<Notifications, "pengingatHakPakaiBerakhir">;
  /** The Perpanjangan page's full URL for a Hak Pakai. */
  perpanjanganUrl: (hakPakaiId: string) => string;
}

const hariAntara = (dari: string, ke: string) => Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);

/** The reminder due `sisaHari` days before the end date (negative: after it), or null before the first one. Pure. */
export function tahapJatuhTempo(sisaHari: number): { tahap: string; sebelumnya: string[]; dekat: boolean } | null {
  if (sisaHari > HARI_PENGINGAT[0]) return null;
  if (sisaHari > 0) {
    const tercapai = HARI_PENGINGAT.filter((hari) => sisaHari <= hari);
    const terakhir = tercapai[tercapai.length - 1]!;
    return { tahap: `h${terakhir}`, sebelumnya: tercapai.slice(0, -1).map((hari) => `h${hari}`), dekat: terakhir === 7 };
  }
  // Day 0 is the end date itself (still valid); the first Masa Tenggang day is 1 after it, and a week repeats from there.
  if (sisaHari === 0) return null;
  return { tahap: `tenggang-${Math.floor((-sisaHari - 1) / 7)}`, sebelumnya: [], dekat: true };
}

/** What one run of the tick did. */
export interface PengingatHasil {
  diumumkan: number;
}

export async function pengingatHakPakaiTick(deps: PengingatDeps, now: Date): Promise<PengingatHasil> {
  if (!dalamJamKirim(now)) return { diumumkan: 0 };
  const hariIni = wibDateOf(now);
  const kandidat = await deps.inventory.hakPakaiMenjelangAkhir(now, HARI_PENGINGAT[0]);
  let diumumkan = 0;
  for (const calon of kandidat) {
    const sisaHari = hariAntara(hariIni, calon.endDate);
    const jatuh = tahapJatuhTempo(sisaHari);
    if (!jatuh) continue;
    const aturan = await deps.lokasi.aturanPerpanjanganOf(calon.lokasiId);
    if (!aturan) continue;
    const masaTenggangBerakhir = addWibDateMonths(calon.endDate, aturan.masaTenggangMonths);
    if (hariIni > masaTenggangBerakhir) continue;
    if (await sudahDipesan(deps, calon.hakPakaiId)) continue;

    const hak = await deps.inventory.hakPakaiUntukPerpanjangan(calon.hakPakaiId);
    if (!hak) continue;
    const admin = await deps.identity.adminLokasiOf(calon.lokasiId);
    // Claim the due stage and announce it in one transaction: a failed announcement leaves no claim, so the next tick
    // retries it. An earlier stage the tick never saw (it ran late) is recorded without being announced.
    const terkirim = await deps.db.transaction(async (tx) => {
      for (const sebelum of jatuh.sebelumnya) await klaim(tx, calon.hakPakaiId, calon.endDate, sebelum, now);
      if (!(await klaim(tx, calon.hakPakaiId, calon.endDate, jatuh.tahap, now))) return false;
      const hasil = await deps.notifikasi.pengingatHakPakaiBerakhir(
        {
          hakPakaiId: calon.hakPakaiId,
          kunci: `${calon.endDate}:${jatuh.tahap}`,
          lokasi: { id: calon.lokasiId, name: aturan.name },
          satuan: labelSatuanHakPakai(hak),
          pemegangHakName: hak.pemegangHak?.name ?? null,
          email: hak.pemegangHak?.email ?? null,
          endDate: calon.endDate,
          sisaHari,
          masaTenggangBerakhir,
          tautan: deps.perpanjanganUrl(calon.hakPakaiId),
          adminLokasi: admin.map((satu) => ({ accountId: satu.accountId })),
          teleponPemesan: jatuh.dekat,
        },
        tx,
      );
      if (!hasil.ok) throw new Error(`pengingat Hak Pakai ${calon.hakPakaiId} ditolak: ${hasil.reason}`);
      return true;
    });
    if (terkirim) diumumkan += 1;
  }
  return { diumumkan };
}

async function klaim(db: Database, hakPakaiId: string, endDate: string, tahap: string, now: Date): Promise<boolean> {
  const dicatat = await db
    .insert(perpanjanganPengingat)
    .values({ hakPakaiId, endDate, tahap, dicatatPada: now })
    .onConflictDoNothing()
    .returning({ id: perpanjanganPengingat.id });
  return dicatat.length > 0;
}

/** Whether a Perpanjangan is ordered for this Hak Pakai and still waiting for its payment (a paid one has moved the end date, so the schedule is new anyway). */
async function sudahDipesan(deps: PengingatDeps, hakPakaiId: string): Promise<boolean> {
  const rows = await deps.db
    .select({ tagihanId: perpanjangan.tagihanId, dibayarPada: perpanjangan.dibayarPada })
    .from(perpanjangan)
    .where(eq(perpanjangan.hakPakaiId, hakPakaiId));
  for (const row of rows) {
    if (row.dibayarPada) continue; // a paid one moved the end date already: it does not stop this schedule
    const tagihan = await deps.billing.tagihanBerlaku(row.tagihanId);
    if (tagihan && tagihan.status !== "dibatalkan") return true;
  }
  return false;
}
