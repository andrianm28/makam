import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { Actor } from "@/domain/identity";
import { addWibDateDays, wibDateOf } from "@/lib/time/jakarta";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra as lokasiMitraTable } from "./schema";

/** Days from the decision to a Berhenti's effective date unless Admin Platform picks one (spec, Lokasi). */
export const BERHENTI_DEFAULT_DAYS = 30;

/**
 * What an order asks of a Lokasi Mitra:
 * - `hak_pakai_baru`: a new Hak Pakai (a Saat Duka new plot, Terencana);
 * - `lanjutan`: everything under an existing Hak Pakai or already in progress (a burial, Perpanjangan,
 *   Layanan, Pembatalan, Ganti Pemegang Hak, Pengembalian Hak Pakai);
 * - `siklus_paket`: issuing the next Paket Layanan cycle.
 */
export type JenisPesanan = "hak_pakai_baru" | "lanjutan" | "siklus_paket";

export type IzinPesanan = { diizinkan: true } | { diizinkan: false; alasan: "ditangguhkan" | "berhenti" };

export interface StatusPesanan {
  status: "belum_tayang" | "terverifikasi" | "ditangguhkan" | "berhenti";
  /** Berhenti only: the WIB date from which no order of any kind is taken. */
  berlakuOn: string | null;
  /** Berhenti only: whether that date has come. */
  berlaku: boolean;
}

export type UbahStatusResult = WriteResult | { ok: false; reason: "status_tidak_cocok" };
export type HentikanResult = ({ ok: true; berlakuOn: string } | Exclude<UbahStatusResult, { ok: true }>) | { ok: false; reason: "tanggal_lampau" };

/** The pure rule: may an order of this kind be taken, given the Lokasi's status and the day. */
export function izinPesananDari(facts: StatusPesanan, jenis: JenisPesanan): IzinPesanan {
  switch (facts.status) {
    case "ditangguhkan":
      return jenis === "hak_pakai_baru" ? { diizinkan: false, alasan: "ditangguhkan" } : { diizinkan: true };
    case "berhenti":
      return facts.berlaku || jenis !== "lanjutan" ? { diizinkan: false, alasan: "berhenti" } : { diizinkan: true };
    default:
      return { diizinkan: true };
  }
}

export async function statusPesananOf(deps: LokasiDeps, lokasiId: string): Promise<StatusPesanan | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ status: lokasiMitraTable.status, berlakuOn: lokasiMitraTable.berhentiBerlakuOn })
    .from(lokasiMitraTable)
    .where(eq(lokasiMitraTable.id, lokasiId));
  if (!row) return null;
  const berlaku = row.status === "berhenti" && row.berlakuOn !== null && row.berlakuOn <= wibDateOf(deps.clock.now());
  return { status: row.status, berlakuOn: row.berlakuOn, berlaku };
}

/** Every order entry point asks this first. An unknown Lokasi is not blocked here (its own lookup refuses it). */
export async function izinPesanan(deps: LokasiDeps, lokasiId: string, jenis: JenisPesanan): Promise<IzinPesanan> {
  const facts = await statusPesananOf(deps, lokasiId);
  return facts ? izinPesananDari(facts, jenis) : { diizinkan: true };
}

/** Admin Platform sets a Terverifikasi Lokasi Mitra Ditangguhkan. Audited. */
export async function tangguhkan(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<UbahStatusResult> {
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.tangguhkan",
    (row) =>
      row.status !== "terverifikasi"
        ? ({ ok: false, reason: "status_tidak_cocok" } as const)
        : { values: { status: "ditangguhkan" as const }, before: { status: row.status }, after: { status: "ditangguhkan" } },
    "lokasi.ubah_status",
  );
}

/** Admin Platform reinstates a Ditangguhkan Lokasi Mitra (Berhenti is final). Audited. */
export async function pulihkan(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<UbahStatusResult> {
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.pulihkan",
    (row) =>
      row.status !== "ditangguhkan"
        ? ({ ok: false, reason: "status_tidak_cocok" } as const)
        : { values: { status: "terverifikasi" as const }, before: { status: row.status }, after: { status: "terverifikasi" } },
    "lokasi.ubah_status",
  );
}

/**
 * Admin Platform sets a Terverifikasi or Ditangguhkan Lokasi Mitra Berhenti, with an effective date (WIB; default
 * 30 days after the decision, never in the past). Audited. Everything that follows (no Paket cycles, the leftovers
 * at the date) reads this state; see `izinPesanan` and `berhentiBerlakuBelumDiproses`.
 */
export async function hentikan(deps: LokasiDeps, by: Actor, lokasiId: string, input: { berlakuOn?: string }): Promise<HentikanResult> {
  const now = deps.clock.now();
  const today = wibDateOf(now);
  const berlakuOn = input.berlakuOn ?? addWibDateDays(today, BERHENTI_DEFAULT_DAYS);
  const result = await writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.hentikan",
    (row) => {
      if (row.status !== "terverifikasi" && row.status !== "ditangguhkan") return { ok: false, reason: "status_tidak_cocok" } as const;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(berlakuOn) || berlakuOn < today) return { ok: false, reason: "tanggal_lampau" } as const;
      return {
        values: { status: "berhenti", berhentiDecidedAt: now, berhentiBerlakuOn: berlakuOn },
        before: { status: row.status },
        after: { status: "berhenti", berlakuOn },
      };
    },
    "lokasi.ubah_status",
  );
  return result.ok ? { ok: true, berlakuOn } : result;
}

/** Berhenti Lokasi whose effective date has come and whose leftovers are not yet settled, oldest date first. */
export async function berhentiBerlakuBelumDiproses(deps: LokasiDeps): Promise<string[]> {
  const rows = await deps.db
    .select({ id: lokasiMitraTable.id })
    .from(lokasiMitraTable)
    .where(
      and(
        eq(lokasiMitraTable.status, "berhenti"),
        isNotNull(lokasiMitraTable.berhentiBerlakuOn),
        lte(lokasiMitraTable.berhentiBerlakuOn, wibDateOf(deps.clock.now())),
        isNull(lokasiMitraTable.berhentiDiprosesAt),
      ),
    )
    .orderBy(lokasiMitraTable.berhentiBerlakuOn, lokasiMitraTable.id);
  return rows.map((row) => row.id);
}

/** The settlement of a Berhenti Lokasi's leftovers is finished; harmless to repeat. */
export async function tandaiBerhentiDiproses(deps: LokasiDeps, lokasiId: string): Promise<void> {
  if (!isLokasiId(lokasiId)) return;
  await deps.db
    .update(lokasiMitraTable)
    .set({ berhentiDiprosesAt: deps.clock.now() })
    .where(and(eq(lokasiMitraTable.id, lokasiId), eq(lokasiMitraTable.status, "berhenti"), isNull(lokasiMitraTable.berhentiDiprosesAt)));
}

/**
 * Whether a quote may price this Lokasi: listed, or Ditangguhkan, or Berhenti before its effective date, because
 * Perpanjangan and the rest of a Hak Pakai's carry-on actions price there (not example data). A new Hak Pakai is
 * kept from Ditangguhkan and Berhenti by `izinPesanan` and by the listing, not by this.
 */
export async function dapatDiharga(deps: LokasiDeps, lokasiId: string): Promise<boolean> {
  if (!isLokasiId(lokasiId)) return false;
  const [row] = await deps.db.select({ dataContoh: lokasiMitraTable.dataContoh }).from(lokasiMitraTable).where(eq(lokasiMitraTable.id, lokasiId));
  if (!row || row.dataContoh) return false;
  const facts = await statusPesananOf(deps, lokasiId);
  if (!facts || facts.status === "belum_tayang") return false;
  return izinPesananDari(facts, "lanjutan").diizinkan;
}
