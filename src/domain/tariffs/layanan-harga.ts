import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { authorize, lokasiMitraResource, tarifGlobalResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import { isUuid } from "./ids";
import { lockLayananHarga } from "./locks";
import { effectiveDateRefusal, effectiveOnSchema, rupiahSchema, type EffectiveDateRefusal, type InvalidTariff, type Rupiah } from "./money";
import { tariffLayananDkiVersion, tariffLayananVersion, tariffMitraJasaVersion } from "./schema";
import { selectVersions, versionTimesOf, writeVersion, type StoredVersionTimes } from "./version-writes";
import { inForceAt } from "./versions";

/**
 * The three Layanan price books, one per variant and all versioned like the
 * rest of the Tariffs module (spec, Tariffs > Lokasi Mitra and Global):
 *
 * - the price a Lokasi Mitra charges for a Layanan variant (`setHargaLayananLokasi`), the only price a family pays at a Lokasi Mitra;
 * - the price a family pays for a Layanan variant at any DKI TPU (`setHargaLayananDki`), the same in every TPU;
 * - the rate the Operator pays a Mitra Jasa for a variant (`setTarifMitraJasa`), never quoted and never shown to the Pemesan.
 *
 * A Layanan variant itself carries no price, so there is no free pricing: a
 * variant without a price in force cannot be offered (the Layanan module reads
 * that through `quote`).
 */

/** Which of the three price books a read or a write is about. */
export type BukuLayanan = "harga_layanan" | "harga_layanan_dki" | "tarif_mitra_jasa";

/** One version of a Layanan variant's price. */
export interface HargaLayananVersion extends StoredVersionTimes {
  amount: Rupiah;
}

export interface SetHargaLayananInput {
  amount: number;
  effectiveOn: string;
  reason: string | null;
}

export type SetHargaLayananResult =
  | { ok: true; version: HargaLayananVersion }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | InvalidTariff
  | EffectiveDateRefusal;

/** The three books' tables: the one book of a Lokasi Mitra's tariffs and the two global ones. */
type TabelBuku = typeof tariffLayananVersion | typeof tariffLayananDkiVersion | typeof tariffMitraJasaVersion;

const tabelBuku: Record<BukuLayanan, TabelBuku> = {
  harga_layanan: tariffLayananVersion,
  harga_layanan_dki: tariffLayananDkiVersion,
  tarif_mitra_jasa: tariffMitraJasaVersion,
};

/** The Entri Audit each book records its entries under. */
const auditOf: Record<BukuLayanan, { action: "tarif.ubah_harga_layanan" | "tarif.ubah_harga_layanan_dki" | "tarif.ubah_tarif_mitra_jasa" }> = {
  harga_layanan: { action: "tarif.ubah_harga_layanan" },
  harga_layanan_dki: { action: "tarif.ubah_harga_layanan_dki" },
  tarif_mitra_jasa: { action: "tarif.ubah_tarif_mitra_jasa" },
};

const hargaSchema = z.object({ amount: rupiahSchema, effectiveOn: effectiveOnSchema });

function toVersion(row: { amount: Rupiah; effectiveOn: string; inForceFrom: Date; seq: number; enteredAt: Date }): HargaLayananVersion {
  return { amount: row.amount, ...versionTimesOf(row) };
}

function snapshot(version: HargaLayananVersion) {
  return { amount: version.amount, effectiveOn: version.effectiveOn };
}

/** Every version of one Layanan variant in one price book, in entry order (none is ever changed or deleted). */
export function versionsOfLayanan(db: Database, buku: BukuLayanan, layananVariantId: string): Promise<HargaLayananVersion[]> {
  if (!isUuid(layananVariantId)) return Promise.resolve([]);
  const table = tabelBuku[buku];
  return selectVersions(db, table, eq(table.layananVariantId, layananVariantId), toVersion);
}

/** The version of one price book in force at `at`, or null when none was yet. */
export async function hargaLayananInForce(db: Database, buku: BukuLayanan, layananVariantId: string, at: Date): Promise<HargaLayananVersion | null> {
  return inForceAt(await versionsOfLayanan(db, buku, layananVariantId), at);
}

/** Every version of one Layanan variant's DKI price, in entry order. */
export function layananDkiVersionList(db: Database, layananVariantId: string): Promise<HargaLayananVersion[]> {
  return versionsOfLayanan(db, "harga_layanan_dki", layananVariantId);
}

/** Every version of one Layanan variant's price at one Lokasi Mitra, in entry order. */
export async function hargaLayananLokasiHistory(db: Database, lokasiId: string, layananVariantId: string): Promise<HargaLayananVersion[]> {
  if (!isUuid(lokasiId) || !isUuid(layananVariantId)) return [];
  return selectVersions(
    db,
    tariffLayananVersion,
    and(eq(tariffLayananVersion.lokasiId, lokasiId), eq(tariffLayananVersion.layananVariantId, layananVariantId)),
    toVersion,
  );
}

/** The price of one Layanan variant at one Lokasi Mitra in force at `at`, or null when none was. */
export async function hargaLayananLokasiInForce(
  db: Database,
  lokasiId: string,
  layananVariantId: string,
  at: Date,
): Promise<HargaLayananVersion | null> {
  return inForceAt(await hargaLayananLokasiHistory(db, lokasiId, layananVariantId), at);
}

/**
 * The whole write of one price book: who may write it, the amount and its
 * effective date, the book's own lock, the new version, and its Entri Audit
 * with the version it replaces. `lokasiId` is the Lokasi Mitra a book belongs
 * to, and only the Lokasi price book has one.
 */
async function writeHarga(
  deps: TariffDeps,
  by: Actor,
  buku: BukuLayanan,
  layananVariantId: string,
  lokasiId: string | null,
  input: SetHargaLayananInput,
): Promise<SetHargaLayananResult> {
  const parsed = hargaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  if (!isUuid(layananVariantId) || (buku === "harga_layanan" && !lokasiId)) {
    return { ok: false, reason: "tidak_ditemukan" };
  }
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(parsed.data.effectiveOn, now);
  if (lampau) return lampau;

  return writeVersion(deps, now, (tx) => lockLayananHarga(tx, `${buku}.${lokasiId ?? ""}.${layananVariantId}`), {
    effectiveOn: parsed.data.effectiveOn,
    versions: (tx) => versionsOfLayanan(tx, buku, layananVariantId),
    insert: async (tx, inForceFrom) => {
      const [row] = await tx
        .insert(tabelBuku[buku])
        .values({
          layananVariantId,
          amount: parsed.data.amount,
          effectiveOn: parsed.data.effectiveOn,
          inForceFrom,
          enteredAt: now,
          enteredByAccountId: by.accountId,
          // Only the Lokasi price book names a Lokasi Mitra; the other two are global.
          ...(lokasiId ? { lokasiId } : {}),
        })
        .returning();
      return toVersion(row);
    },
    entry: (replaced, version) => ({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: auditOf[buku].action,
      entity: { kind: buku, id: layananVariantId },
      lokasiId,
      before: replaced && snapshot(replaced),
      after: snapshot(version),
      reason: input.reason?.trim() || null,
    }),
  });
}

/** Admin Platform enters a new price for one Layanan variant at one Lokasi Mitra; audited on that Lokasi. */
export async function setHargaLayananLokasi(
  deps: TariffDeps,
  by: Actor,
  lokasiId: string,
  layananVariantId: string,
  input: SetHargaLayananInput,
): Promise<SetHargaLayananResult> {
  // Defence in depth behind guarded(): the module checks the actor itself, before anything else.
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const lokasi = await deps.lokasi.lokasiMitra(by, lokasiId);
  if (!lokasi.ok) return lokasi;
  return writeHarga(deps, by, "harga_layanan", layananVariantId, lokasiId, input);
}

/** Admin Platform enters a new DKI price for one Layanan variant (the same at every TPU); audited. */
export async function setHargaLayananDki(
  deps: TariffDeps,
  by: Actor,
  layananVariantId: string,
  input: SetHargaLayananInput,
): Promise<SetHargaLayananResult> {
  const refusal = writeRefusal(by, "tarif.ubah", tarifGlobalResource());
  if (refusal) return refusal;
  return writeHarga(deps, by, "harga_layanan_dki", layananVariantId, null, input);
}

/** Admin Platform enters a new Mitra Jasa rate for one Layanan variant; audited, and never shown to a Pemesan. */
export async function setTarifMitraJasa(
  deps: TariffDeps,
  by: Actor,
  layananVariantId: string,
  input: SetHargaLayananInput,
): Promise<SetHargaLayananResult> {
  const refusal = writeRefusal(by, "tarif.ubah", tarifGlobalResource());
  if (refusal) return refusal;
  return writeHarga(deps, by, "tarif_mitra_jasa", layananVariantId, null, input);
}

/**
 * The Mitra Jasa rate in force at `at`, for Admin Platform only: it is what the
 * Operator pays, so a Pemesan (and an Admin Lokasi) never reads it. Null for
 * anyone else, and when no version was in force.
 */
export async function tarifMitraJasaInForce(
  db: Database,
  by: Actor,
  layananVariantId: string,
  at: Date,
): Promise<HargaLayananVersion | null> {
  if (!authorize(by, "tarif.ubah", tarifGlobalResource()).allowed) return null;
  return hargaLayananInForce(db, "tarif_mitra_jasa", layananVariantId, at);
}
