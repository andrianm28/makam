/**
 * The two worker ticks of a Pemesanan Terencana's money (spec, Scheduler: "expire
 * holds and pay-first Tagihan"; ticket 37). Both are idempotent, both read state
 * rather than being called from either side, and neither trusts an in-memory handoff
 * from the other half.
 *
 * **`terencanaDibayarTick`** — the paid half. Billing's payment effect records that an
 * order's Tagihan is Lunas inside the transaction that settled it
 * (`./efek-terencana.ts`); this tick turns that fact into the order's right: one Hak
 * Pakai per chosen Petak Makam or whole Kavling Keluarga, all with the same Pemegang
 * Hak and the same Calon Penghuni label, and the one Bukti Pemesanan. The order
 * becomes `aktif`, and the tenure clock stays unstarted — the Hak Pakai's end date is
 * empty until the first Pemakaman, which is ticket 25's.
 *
 * **`terencanaLapsedTick`** — the unpaid half. Billing's own `lapsePayFirstTagihanTick`
 * already makes a pay-first Tagihan Dibatalkan at its due date, and that due date *is*
 * the hold's end: `inventory_plot_hold` carries only `placed_at`, so "the hold has
 * expired" is read from `tagihan.due_at` and there is no second clock to disagree with
 * it. What Billing cannot do is follow the money into the order, so this tick reads
 * every `dikonfirmasi` order whose Tagihan is Dibatalkan for "batas pembayaran lewat"
 * and ends the order the same way, releasing its plots.
 *
 * Why a second tick rather than an extension of Billing's: Billing's tick answers with
 * *the ids it lapsed in this run*, which is not a durable handoff. A worker that died
 * between the two updates, or a Billing tick that ran before the order was confirmed,
 * would leave the order `dikonfirmasi` forever with a dead Tagihan. Reading the order's
 * own state instead makes the halves independent and order-free, and the guard
 * (`status = 'dikonfirmasi'`) is what makes a second run — or two workers at once — a
 * no-op: the second matches no row and releases nothing.
 */
import { and, asc, eq } from "drizzle-orm";
import { refusable } from "@/db/unit-of-work";
import { normalisePhoneNumber } from "@/domain/identity";
import type { BuktiPemesananMasa } from "@/domain/billing";
import type { PemesananDeps } from "./deps";
import { pemesananTerencana, pemesananTerencanaPembayaran, pemesananTerencanaUnit } from "./schema";
import { ALASAN_BATAS_PEMBAYARAN_LEWAT } from "./terencana-konfirmasi";

/** What one run of the paid tick did, for the worker's log and a test to read. */
export interface TickTerencanaDibayar {
  /** Orders that became `aktif` with their Hak Pakai and their Bukti Pemesanan. */
  diaktifkan: number;
  /** Orders left waiting because the grant could not be applied; each names why, and the next run tries again. */
  gagal: { nomor: string; alasan: string }[];
}

/**
 * Every paid order still waiting becomes `aktif`, with one Hak Pakai per chosen unit
 * and its one Bukti Pemesanan. Idempotent: the guard is the order's own
 * `dikonfirmasi`, so a second run, a retried effect or two workers at once leave one
 * set of Hak Pakai and one Bukti.
 */
export async function terencanaDibayarTick(deps: PemesananDeps, now: Date): Promise<TickTerencanaDibayar> {
  const menunggu = await deps.db
    .select({ nomor: pemesananTerencanaPembayaran.nomorPemesanan, tagihanId: pemesananTerencanaPembayaran.tagihanId })
    .from(pemesananTerencanaPembayaran)
    .innerJoin(pemesananTerencana, eq(pemesananTerencana.nomor, pemesananTerencanaPembayaran.nomorPemesanan))
    .where(eq(pemesananTerencana.status, "dikonfirmasi"))
    .orderBy(asc(pemesananTerencanaPembayaran.dibayarPada));
  const hasil: TickTerencanaDibayar = { diaktifkan: 0, gagal: [] };
  for (const row of menunggu) {
    const alasan = await aktifkan(deps, row.nomor, row.tagihanId, now);
    if (alasan === null) hasil.diaktifkan += 1;
    else hasil.gagal.push({ nomor: row.nomor, alasan });
  }
  return hasil;
}

/** Why one order could not be activated, or null when it was. */
type GagalAktifkan =
  | "bukan_pesanan_menunggu"
  | "tagihan_beda"
  | "tanpa_unit"
  | "pemegang_hak_kosong"
  | "telepon_pemegang_hak_tidak_valid"
  | "konfirmasi_tanpa_penulis"
  | "sudah_dibayar"
  | `hak_pakai:${string}`
  | `bukti_pemesanan:${string}`;

/**
 * One order's right, in one transaction: the grants, the Bukti, the order's own status.
 * A failure returns its reason and rolls everything back, so the order stays
 * `dikonfirmasi` and the next run tries again — a transient failure never strands a
 * family that has paid.
 */
async function aktifkan(deps: PemesananDeps, nomor: string, tagihanId: string, now: Date): Promise<GagalAktifkan | null> {
  type Hasil = { ok: true } | { ok: false; alasan: GagalAktifkan };
  const ditulis = await refusable<Hasil>(deps.db, async (tx) => {
    const [order] = await tx.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, nomor)).for("update");
    const gagal = (alasan: GagalAktifkan): Hasil => ({ ok: false, alasan });
    if (!order || order.status !== "dikonfirmasi") return gagal("bukan_pesanan_menunggu");
    if (order.tagihanId !== tagihanId) return gagal("tagihan_beda");
    if (order.pemegangHak.name.trim() === "") return gagal("pemegang_hak_kosong");
    if (order.dikonfirmasiOleh === null) return gagal("konfirmasi_tanpa_penulis");

    const units = await tx
      .select()
      .from(pemesananTerencanaUnit)
      .where(eq(pemesananTerencanaUnit.pemesananId, order.id))
      .orderBy(pemesananTerencanaUnit.urutan);
    if (units.length === 0) return gagal("tanpa_unit");

    const phone = normalisePhoneNumber(order.pemegangHak.phoneNumber ?? order.phoneNumber);
    if (!phone.ok) return gagal("telepon_pemegang_hak_tidak_valid");

    // One Hak Pakai per chosen unit, each carrying the order's Pemegang Hak and its
    // Calon Penghuni label. A refusal here is a refusal of the whole: half a right is no
    // right at all, so the transaction rolls back and the order stays waiting.
    const hakPakai: { unitId: string; id: string; nomor: string; jenis: "petak" | "kavling"; jenisMakamName: string; tenureYears: number | null }[] = [];
    for (const unit of units) {
      const diberi = await deps.inventory.within(tx).beriHakPakaiTerencana(tx, order.lokasiId, {
        nomorPemesanan: order.nomor,
        unit: unit.petakId ? { petakId: unit.petakId } : { kavlingId: unit.kavlingId! },
        jenisMakamId: unit.jenisMakamId,
        pemegangHak: { name: order.pemegangHak.name, phoneNumber: phone.phoneNumber, email: order.pemegangHak.email ?? undefined },
        calonPenghuni: order.calonPenghuni.name,
        dikonfirmasiOleh: order.dikonfirmasiOleh,
      });
      if (!diberi.ok) return gagal(`hak_pakai:${diberi.reason}`);
      hakPakai.push({
        unitId: unit.id,
        id: diberi.hakPakaiId,
        nomor: diberi.nomor,
        jenis: unit.petakId ? "petak" : "kavling",
        jenisMakamName: unit.jenisMakamName,
        tenureYears: diberi.tenureYears,
      });
    }

    // The Bukti Pemesanan states the right and carries no amounts (CONTEXT.md), so its
    // Masa Hak Pakai is the term the grants were just made with, and its start and end
    // are empty: the clock starts at the first Pemakaman, and there has not been one.
    const tahun = hakPakai[0].tenureYears;
    const masaHakPakai: BuktiPemesananMasa = tahun === null ? { jenis: "selamanya" } : { jenis: "tahun", years: tahun, mulai: null, sampai: null };
    const bukti = await deps.billing.within(tx).terbitkanBuktiPemesanan(tx, {
      nomorPemesanan: order.nomor,
      tagihanId,
      lokasiNama: order.lokasiName,
      unit: hakPakai.map((satu) => ({ jenis: satu.jenis, nomor: satu.nomor, jenisMakamName: satu.jenisMakamName })),
      pemegangHak: { name: order.pemegangHak.name, phoneNumber: phone.phoneNumber, email: order.pemegangHak.email },
      calonPenghuni: order.calonPenghuni.name,
      masaHakPakai,
      issuedAt: now,
    });
    if (!bukti.ok) return gagal(`bukti_pemesanan:${bukti.reason}`);

    for (const satu of hakPakai) {
      await tx.update(pemesananTerencanaUnit).set({ hakPakaiId: satu.id }).where(eq(pemesananTerencanaUnit.id, satu.unitId));
    }
    // Guarded on the status the tick read, so a withdrawal landing at the same moment wins
    // and the payment is left for Admin Platform as a Pembayaran Perlu Ditinjau rather
    // than a right granted against a cancelled order.
    const moved = await tx
      .update(pemesananTerencana)
      .set({ status: "aktif", aktifPada: now })
      .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "dikonfirmasi")))
      .returning({ id: pemesananTerencana.id });
    if (moved.length === 0) return gagal("sudah_dibayar");
    return { ok: true };
  });
  return ditulis.ok ? null : ditulis.alasan;
}

/** What one run of the lapse tick did. */
export interface TickTerencanaLapsed {
  /** Orders that became `dibatalkan` and gave their plots back. */
  dibatalkan: number;
  /** Plots released in total by those orders. */
  plotsDirilis: number;
}

/**
 * Every `dikonfirmasi` order whose Tagihan is Dibatalkan for "batas pembayaran lewat" —
 * a pay-first Tagihan past its due date, which is this hold expiring unpaid — becomes
 * `dibatalkan` with that reason, and its plots are released in the same transaction
 * (spec, Pemesanan > Terencana: "Dibatalkan (reason 'batas pembayaran lewat')").
 *
 * The Tagihan is read through Billing's own public read, never its tables. A Tagihan
 * that is merely paid late is **not** this: a pay-first Tagihan paid at or after its due
 * date becomes a Pembayaran Perlu Ditinjau (spec, Billing), which Admin Platform accepts
 * only if the plots are still free — so money that arrives late never reaches
 * `dibatalkan` here, and the order keeps its hold for that decision.
 *
 * Idempotent, and safe with two workers at once: the guarded `dikonfirmasi → dibatalkan`
 * move is the lock, so exactly one of them releases the plots.
 */
export async function terencanaLapsedTick(deps: PemesananDeps, now: Date): Promise<TickTerencanaLapsed> {
  const menunggu = await deps.db
    .select({ id: pemesananTerencana.id, nomor: pemesananTerencana.nomor, tagihanId: pemesananTerencana.tagihanId })
    .from(pemesananTerencana)
    .where(eq(pemesananTerencana.status, "dikonfirmasi"))
    .orderBy(pemesananTerencana.nomor);
  const hasil: TickTerencanaLapsed = { dibatalkan: 0, plotsDirilis: 0 };
  for (const order of menunggu) {
    if (order.tagihanId === null) continue;
    const tagihan = await deps.billing.tagihan(order.tagihanId);
    if (!tagihan || tagihan.status !== "dibatalkan" || tagihan.cancelledReason !== "batas_pembayaran_lewat") continue;
    if (tagihan.dueAt > now) continue;
    const ditulis = await refusable<{ ok: true; plots: number } | { ok: false }>(deps.db, async (tx) => {
      const moved = await tx
        .update(pemesananTerencana)
        .set({ status: "dibatalkan", alasan: ALASAN_BATAS_PEMBAYARAN_LEWAT })
        .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "dikonfirmasi")))
        .returning({ id: pemesananTerencana.id });
      if (moved.length === 0) return { ok: false as const };
      const lepas = await deps.inventory.within(tx).lepasTahan(order.nomor);
      return { ok: true as const, plots: lepas.released };
    });
    if (!ditulis.ok) continue;
    hasil.dibatalkan += 1;
    hasil.plotsDirilis += ditulis.plots;
  }
  return hasil;
}
