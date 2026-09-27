/**
 * The re-alert of a Saat Duka order that is still unconfirmed (spec,
 * Notifications: "A new Saat Duka order alerts every Admin Lokasi of the Lokasi
 * and the Kontak Siaga by web push + email at any hour, and again if still
 * unconfirmed after 1 h of Jam Operasional"; ticket 23's AC 3).
 *
 * A worker tick, not a queue: the row that flips `realert_pada` from null is the
 * claim, so a tick that runs twice (or two workers at once) alerts the Lokasi's
 * staff once. The instant is one service hour of the Lokasi's own Jam
 * Operasional after the submission, counted by the same working-time calculator
 * the confirmation deadline uses, so a Lokasi closed for the night or the
 * weekend is not chased at 02:00.
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { pemesananMakam } from "./schema";
import type { PemesananDeps } from "./deps";
import type { PemesananDiajukan } from "./deps";

/** How many service hours of the Lokasi's Jam Operasional a re-alert waits. */
export const JAM_REALERT_SAAT_DUKA = 1;

/** What one re-alert did. */
export interface RealertHasil {
  /** Orders whose staff were alerted again this run. */
  realert: number;
}

/**
 * Scheduler tick: alerts the Lokasi's staff again about every order still
 * unconfirmed one service hour after it was submitted, and about no other order
 * and no more than once. Idempotent: a second run at the same `now` finds every
 * re-alert already claimed.
 */
export async function realertKonfirmasiSaatDukaTick(
  deps: Pick<PemesananDeps, "db" | "clock" | "notifikasi"> & {
    lokasi: Pick<PemesananDeps["lokasi"], "serviceHoursDeadline" | "kontakSiagaOf">;
    identity: Pick<PemesananDeps["identity"], "adminLokasiOf">;
  },
  now: Date,
): Promise<RealertHasil> {
  const terbuka = await deps.db
    .select()
    .from(pemesananMakam)
    .where(
      and(
        eq(pemesananMakam.status, "diajukan"),
        isNull(pemesananMakam.realertPada),
        isNotNull(pemesananMakam.jenisMakamId),
      ),
    );
  let realert = 0;
  for (const order of terbuka) {
    const batas = await deps.lokasi.serviceHoursDeadline(order.lokasiId, JAM_REALERT_SAAT_DUKA, order.diajukanAt);
    // A Jam Operasional belum diisi promised nothing, so there is no hour to count and nothing to chase.
    if (!batas.ok || batas.at > now) continue;
    const diklaim = await deps.db
      .update(pemesananMakam)
      .set({ realertPada: now })
      .where(and(eq(pemesananMakam.id, order.id), isNull(pemesananMakam.realertPada)))
      .returning({ id: pemesananMakam.id });
    if (diklaim.length === 0) continue;
    const pengumuman: PemesananDiajukan = {
      id: order.id,
      nomor: order.nomor,
      lokasi: { id: order.lokasiId, name: order.lokasiName },
      jenisMakamName: order.jenisMakamName,
      almarhum: { name: order.almarhumName, tanggalWafat: order.tanggalWafat },
      pemesan: { name: order.pemesanName, phoneNumber: order.phoneNumber, email: order.email },
      rencanaPemakamanAt: order.rencanaPemakamanAt,
      konfirmasiDueAt: order.konfirmasiDueAt,
      penerima: await penerimaOf(deps, order.lokasiId),
    };
    await deps.notifikasi.pesananBelumDikonfirmasi(pengumuman);
    realert += 1;
  }
  return { realert };
}

/**
 * Every Akun Staf that must see an order at that Lokasi Mitra: its Admin Lokasi,
 * and its Kontak Siaga when that is one of them. Once each: a Lokasi Mitra's
 * staff never hears the same order twice.
 */
async function penerimaOf(
  deps: { lokasi: Pick<PemesananDeps["lokasi"], "kontakSiagaOf">; identity: Pick<PemesananDeps["identity"], "adminLokasiOf"> },
  lokasiId: string,
): Promise<{ accountId: string }[]> {
  const [adminLokasi, kontakSiaga] = await Promise.all([deps.identity.adminLokasiOf(lokasiId), deps.lokasi.kontakSiagaOf(lokasiId)]);
  const ids = new Set(adminLokasi.map((akun) => akun.accountId));
  if (kontakSiaga) ids.add(kontakSiaga.accountId);
  return [...ids].map((accountId) => ({ accountId }));
}
