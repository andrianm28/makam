/**
 * The Bukti Pemesanan (spec, Billing: every payment "fires the downstream
 * effects: Bukti Pemesanan / Perpanjangan, …"; Pemesanan > Saat Duka: "Selesai =
 * Tagihan Lunas + Bukti Pemesanan issued"; ticket 25's AC 4).
 *
 * Two facts make an order Selesai — a recorded burial and a paid Tagihan — and
 * either can come second. So the document is issued where the *second* one
 * lands, through one function both paths call:
 *  - a payment settles while the burial is already recorded: Billing's own
 *    payment effect, inside the very transaction that makes the Tagihan Lunas;
 *  - the burial is recorded while the Tagihan is already Lunas: the recording
 *    step itself, in the same transaction as the burial.
 *
 * Either way the document, its BPM number and the order's Selesai status commit
 * together, and both paths are idempotent: a redelivered webhook, a retried
 * effect or a second recording issues no second Bukti and no second number.
 *
 * Neither a TPU order nor a burial under an existing Hak Pakai gets one: the IPTM
 * is the proof of a TPU grave, and a further burial grants no new right.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing, PaymentEffect, SettledPayment } from "@/domain/billing";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import type { MasaBuktiPemesanan } from "@/lib/billing-labels";
import { pemesananMakam, pemesananTerencana } from "./schema";
import { aktifkanTerencana } from "./terencana-aktif";
import type { PemesananDeps } from "./deps";

export interface BuktiPemesananEffectDeps {
  clock: { now(): Date };
  /**
   * Billing on the payment's own transaction: the effect runs inside the very
   * transaction that settles the Tagihan, and the document has to commit with
   * the money, so it is issued `within` that transaction like every other
   * cross-module write inside one.
   */
  billingOn: (tx: Database) => Pick<Billing, "issueBuktiPemesanan" | "tagihan" | "tagihanBerlaku">;
  inventory: Pick<PemesananDeps["inventory"], "within">;
  lokasi: Pick<PemesananDeps["lokasi"], "publicLokasiMitra">;
  notifikasi: PemesananDeps["notifikasi"];
  /**
   * Payouts' record that a paid Pemesanan Terencana's Masa Pembatalan runs until a given
   * instant, written in the payment's own transaction (ticket 37). Payouts is composed after
   * Billing, so this is the one function it exposes without needing the module itself.
   */
  pencairan: { masaPembatalanDimulai(tx: Database, input: { nomorPemesanan: string; berakhirPada: Date }): Promise<void> };
}

/**
 * The "pemesanan.bukti_pemesanan" effect: a payment that settles a Saat Duka
 * order whose burial is already recorded earns that order its Bukti Pemesanan.
 * Ignores a payment that is not this module's (any other Tagihan kind), as every
 * effect must.
 */
export function efekBuktiPemesanan(deps: BuktiPemesananEffectDeps): PaymentEffect {
  return {
    name: "pemesanan.bukti_pemesanan",
    async run(tx: Database, payment: SettledPayment) {
      const now = deps.clock.now();
      if (!payment.nomorPemesanan) return;
      // A Pemesanan Terencana is paid first: its payment is what makes it Aktif (ticket 37).
      const [terencana] = await tx
        .select({ id: pemesananTerencana.id })
        .from(pemesananTerencana)
        .where(eq(pemesananTerencana.nomor, payment.nomorPemesanan));
      if (terencana) {
        await aktifkanTerencana(tx, deps, { nomorPemesanan: payment.nomorPemesanan, tagihanId: payment.tagihanId, paidAt: payment.paidAt });
        return;
      }
      const [order] = await tx.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, payment.nomorPemesanan));
      if (!order || order.kind !== "saat_duka") return;
      // The burial must already be on record: the document names the Hak Pakai's
      // term, and that term starts at the first Pemakaman. The other order of the
      // two facts — paid first, buried later — is the recording step's own.
      if (order.status !== "dimakamkan") return;
      await terbitkanBukti(tx, deps, order.id, now);
    },
  };
}

/**
 * Issues `order`'s one Bukti Pemesanan and makes it Selesai, in `tx`. A no-op for
 * an order that already has one, for an order with no plot (a TPU order, a
 * further burial), and for one whose Hak Pakai has no first Pemakaman to print.
 * Returns the Bukti's number when it issued one.
 */
export async function terbitkanBukti(
  tx: Database,
  deps: Pick<BuktiPemesananEffectDeps, "billingOn" | "inventory" | "lokasi" | "notifikasi">,
  pemesananId: string,
  now: Date,
): Promise<string | null> {
  const [order] = await tx.select().from(pemesananMakam).where(eq(pemesananMakam.id, pemesananId));
  if (!order || order.status === "selesai" || order.buktiPemesananId) return null;
  if (order.kind !== "saat_duka" || !order.tagihanId || !order.hakPakaiId || !order.petakNomor) return null;
  // The document names the Hak Pakai's term, and that term starts at the first
  // Pemakaman: an order whose burial is not yet recorded has no masa to print.
  if (!order.pemakamanTanggal) return null;

  const hakPakai = await deps.inventory.within(tx).hakPakaiById(order.hakPakaiId);
  // The document states the Hak Pakai's own term; a term it cannot read is not
  // stated, and the order stays short of Selesai until a human looks. Defensive
  // rather than reachable: a Dimakamkan order got there through `catatPemakaman`,
  // which starts the clock in the same transaction, and nothing in the codebase
  // clears `tenure_start_at` or deletes a Hak Pakai — so no public-interface test
  // can drive this branch, and inventing one would assert on a fiction.
  const masa = masaHakPakai(hakPakai);
  if (!masa) return null;
  const lokasi = await deps.lokasi.publicLokasiMitra(order.lokasiId);
  const query = lokasi ? mapsQueryFor(lokasi) : null;
  // The Bukti belongs to the Tagihan in force, the one the family paid, not one a Harga Khusus replaced (ticket 93).
  const berlaku = await deps.billingOn(tx).tagihanBerlaku(order.tagihanId);
  // An order that reached Dimakamkan has its Tagihan: none found is a broken invariant, so it fails visibly (the payment effect is retried and reported) rather than leaving the order short of Selesai in silence.
  if (!berlaku) throw new Error("a Saat Duka order names a Tagihan that does not exist");
  const bukti = await deps.billingOn(tx).issueBuktiPemesanan({
    tagihanId: berlaku.id,
    pemesananId: order.id,
    nomorPemesanan: order.nomor,
    lokasiName: order.lokasiName,
    petakNomor: order.petakNomor,
    pemegangHakName: hakPakai?.pemegangHak?.name ?? order.pemegangHak.name,
    masa,
    petunjukArah: query ? directionsUrl(query) : null,
  });
  if (!bukti.ok) return null;

  const moved = await tx
    .update(pemesananMakam)
    .set({ status: "selesai", buktiPemesananId: bukti.bukti.id, selesaiPada: now })
    .where(and(eq(pemesananMakam.id, order.id), isNull(pemesananMakam.buktiPemesananId)))
    .returning({ id: pemesananMakam.id });
  if (!moved) return null;
  await deps.notifikasi.pesananBuktiPemesanan({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    bukti: { nomor: bukti.bukti.nomor, link: bukti.bukti.link },
    petakNomor: order.petakNomor,
    pemegangHakName: bukti.bukti.pemegangHakName,
    masa: bukti.bukti.masa,
  });
  return bukti.bukti.nomor;
}

/**
 * The Hak Pakai's own masa, read from the Inventory module: the first
 * Pemakaman's date, and the end of a fixed term (null for a Selamanya Jenis
 * Makam). Null when the Hak Pakai cannot be read at all, or its term clock has
 * not started — and then **no Bukti Pemesanan is issued at all**, because a
 * document that proves a right must state the right's term rather than guess:
 * a null end date printed as "selamanya" on a term nobody has read would be the
 * same lie as calling a five-year right limitless.
 */
function masaHakPakai(hakPakai: { tenureStartAt: Date | null; endDate: Date | null } | null): MasaBuktiPemesanan | null {
  if (!hakPakai?.tenureStartAt) return null;
  // `tenure_start_at` and `end_date` are date columns written at UTC midnight, so
  // they read back as the calendar days they were — never as a WIB instant.
  return {
    mulai: hakPakai.tenureStartAt.toISOString().slice(0, 10),
    selesai: hakPakai.endDate ? hakPakai.endDate.toISOString().slice(0, 10) : null,
  };
}
