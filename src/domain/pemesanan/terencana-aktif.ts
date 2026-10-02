/**
 * A Pemesanan Terencana becomes Aktif when its Tagihan is paid (spec, Pemesanan >
 * Terencana: "Aktif (paid, one Hak Pakai per Petak / Kavling Keluarga, same Pemegang
 * Hak)"; Billing: every payment "fires the downstream effects: Bukti Pemesanan / …";
 * ticket 37). It runs as Billing's payment effect, inside the very transaction that made
 * the Tagihan Lunas, so all of it commits with the money:
 *
 * - the hold on the plots becomes one Aktif Hak Pakai per Petak Makam or Kavling
 *   Keluarga, all with the same Pemegang Hak, each carrying the Syarat snapshot the
 *   order was placed under and the Calon Penghuni label (the hold is released in the
 *   same step). The end date of each stays empty: the term starts at the first
 *   Pemakaman, and for a perpetual Jenis Makam it never has one;
 * - the Bukti Pemesanan is issued, one for the whole order, in the Lokasi Mitra's name;
 * - Payouts is told when the Masa Pembatalan ends (the trigger of the Lokasi Mitra's
 *   Hak Pakai item), counted from the payment on the Syarat snapshot;
 * - the family is emailed the Bukti.
 *
 * Idempotent: an order that is already Aktif is left as it is, so a redelivered webhook
 * or a retried effect grants no second Hak Pakai and issues no second Bukti.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import { directionsUrl, mapsQueryFor } from "@/lib/maps";
import type { Tenure } from "@/domain/tariffs";
import type { BuktiPemesananEffectDeps } from "./efek-bukti-pemesanan";
import { pemesananTerencana, pemesananTerencanaUnit } from "./schema";

const DAY_MS = 24 * 3_600_000;

/** The Masa Pembatalan's end: the payment plus the days the order's own Syarat gave, never the Lokasi Mitra's current policy. */
export function masaPembatalanBerakhir(paidAt: Date, masaPembatalanDays: number): Date {
  return new Date(paidAt.getTime() + masaPembatalanDays * DAY_MS);
}

/**
 * The term the Bukti Pemesanan states for an order whose plots have no Pemakaman yet: how long a
 * fixed term runs from the first burial, or none for a perpetual one. When the plots' Jenis Makam
 * were sold with different terms the **shortest** fixed one is stated — never a term longer than one
 * of the plots really has — and each plot's own term is named beside its number.
 */
function masaBelumMulai(tenures: readonly (number | null)[]): { mulai: null; selesai: null; tahun: number | null } {
  const tetap = tenures.filter((tahun): tahun is number => tahun !== null);
  return { mulai: null, selesai: null, tahun: tetap.length > 0 ? Math.min(...tetap) : null };
}

/** The plots as the Bukti names them: bare numbers when every plot has the same term, else each with its own. */
function daftarPetak(units: readonly { nomor: string; tenureYears: number | null }[]): string {
  const sama = units.every((unit) => unit.tenureYears === units[0].tenureYears);
  if (sama) return units.map((unit) => unit.nomor).join(", ");
  return units.map((unit) => `${unit.nomor} (${unit.tenureYears === null ? "selamanya" : `${unit.tenureYears} tahun`})`).join(", ");
}

/**
 * Makes one Dikonfirmasi order Aktif in `tx` and returns the Bukti's number when it issued
 * one. A no-op for an order that is Aktif already; an order in any state a paid Tagihan should
 * never meet (Ditolak, Dibatalkan, still Diajukan) is an error, so the payment effect fails
 * loudly and is reported rather than quietly leaving a family with a paid Tagihan and no right.
 */
export async function aktifkanTerencana(
  tx: Database,
  deps: Pick<BuktiPemesananEffectDeps, "billingOn" | "inventory" | "lokasi" | "notifikasi" | "pencairan">,
  input: { nomorPemesanan: string; tagihanId: string; paidAt: Date },
): Promise<string | null> {
  const [order] = await tx.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, input.nomorPemesanan));
  if (!order) return null;
  if (order.status === "aktif") return null;
  if (order.status !== "dikonfirmasi") {
    throw new Error(`a paid Tagihan met a Pemesanan Terencana that is ${order.status}, not Dikonfirmasi`);
  }
  const units = await tx
    .select()
    .from(pemesananTerencanaUnit)
    .where(eq(pemesananTerencanaUnit.pemesananId, order.id))
    .orderBy(asc(pemesananTerencanaUnit.urutan));
  const perUnit = units.map((unit) => ({ ...unit, nomor: unit.nomorMakam ?? unit.nomorKavling ?? "" }));

  const holder = order.pemegangHak;
  const phoneNumber = holder.phoneNumber ?? order.phoneNumber;
  const granted = await deps.inventory.within(tx).beriHakPakaiDariTahan({
    nomorPemesanan: order.nomor,
    oleh: { accountId: order.pemesanAccountId },
    pemegangHak: { name: holder.name, phoneNumber, email: holder.email ?? undefined },
    calonPenghuni: order.calonPenghuni.name ?? order.pemesanName,
    syarat: order.syarat,
    units: perUnit.map((unit) => ({
      petakId: unit.petakId ?? undefined,
      kavlingId: unit.kavlingId ?? undefined,
      tenure: (unit.tenureYears === null ? null : { kind: "tahun", years: unit.tenureYears }) satisfies Tenure | null,
    })),
  });
  if (!granted.ok) throw new Error(`the hold of a paid Pemesanan Terencana could not become Hak Pakai: ${granted.reason}`);
  for (const [index, unit] of perUnit.entries()) {
    await tx.update(pemesananTerencanaUnit).set({ hakPakaiId: granted.hakPakai[index].hakPakaiId }).where(eq(pemesananTerencanaUnit.id, unit.id));
  }

  const lokasi = await deps.lokasi.publicLokasiMitraTampil(order.lokasiId);
  const query = lokasi ? mapsQueryFor(lokasi) : null;
  const masa = masaBelumMulai(perUnit.map((unit) => unit.tenureYears));
  const bukti = await deps.billingOn(tx).issueBuktiPemesanan({
    tagihanId: input.tagihanId,
    pemesananId: order.id,
    nomorPemesanan: order.nomor,
    lokasiName: order.lokasiName,
    petakNomor: daftarPetak(perUnit),
    pemegangHakName: holder.name,
    masa,
    petunjukArah: query ? directionsUrl(query) : null,
  });
  // `sudah_terbit`: the order got its Bukti in an earlier run that did not finish; the Hak Pakai above did not exist then,
  // so this only happens after a partial failure that the savepoint rolled back whole. Anything else is a real refusal.
  if (!bukti.ok) throw new Error(`the Bukti Pemesanan of a paid Pemesanan Terencana was refused: ${bukti.reason}`);

  const berakhirPada = masaPembatalanBerakhir(input.paidAt, order.syarat.masaPembatalanDays);
  const aktif = await tx
    .update(pemesananTerencana)
    .set({ status: "aktif", aktifPada: input.paidAt, masaPembatalanBerakhirPada: berakhirPada, buktiPemesananId: bukti.bukti.id })
    .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "dikonfirmasi")))
    .returning({ id: pemesananTerencana.id });
  if (aktif.length === 0) throw new Error("a Pemesanan Terencana stopped being Dikonfirmasi while its payment was being applied");
  await deps.pencairan.masaPembatalanDimulai(tx, { nomorPemesanan: order.nomor, berakhirPada });
  await deps.notifikasi.terencanaBukti(tx, {
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    unit: perUnit.map((unit) => ({ nomor: unit.nomor, jenisMakamName: unit.jenisMakamName })),
    bukti: { nomor: bukti.bukti.nomor, link: bukti.bukti.link },
    pemegangHakName: bukti.bukti.pemegangHakName,
    masa: bukti.bukti.masa,
    masaPembatalanBerakhirPada: berakhirPada,
  });
  return bukti.bukti.nomor;
}

/** What `aktifkanTerencana` asks of Billing, spelled out for a reader of the effect's dependencies. */
export type BillingUntukBukti = Pick<Billing, "issueBuktiPemesanan" | "tagihan" | "tagihanBerlaku">;
