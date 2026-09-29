/**
 * Granting one Hak Pakai: the row, its Pemegang Hak and (when the flow knows
 * it) its first Pemakaman. Shared by the Petak clearing flow ("terisi") and by
 * a Pemesanan Makam's confirmation, which assigns a cleared Tersedia Petak
 * (spec, Inventory > Hak Pakai).
 *
 * Tenure is the Jenis Makam's own term, read once by the caller and passed in;
 * the tenure clock starts at the first Pemakaman's date, never at "now", so a
 * burial entered long after it happened still counts from the day it did.
 */
import type { Database } from "@/db/client";
import type { Tenure } from "@/domain/tariffs";
import { inventoryHakPakai, inventoryPemakaman, inventoryPemegangHak, type SyaratHakPakai } from "./schema";
import { addYears } from "./tenure";

/** The Pemegang Hak a grant records: never the Almarhum, and never empty. */
export interface NewPemegangHak {
  name: string;
  phoneNumber: string;
  email?: string;
}

/** A first Pemakaman entered with the grant, when the flow knows one. */
export interface NewPemakaman {
  almarhumName: string;
  /** A whole date (WIB has no bearing on which calendar day a burial falls on). */
  date: string;
  layer?: number;
  petakId: string;
}

export interface GrantHakPakaiInput {
  lokasiId: string;
  petakId: string | null;
  kavlingId: string | null;
  /** The Jenis Makam's term in force, read by the caller; null = Selamanya. */
  tenure: Tenure | null;
  /** "Data menyusul": an imported Hak Pakai whose holder or tenure is not known yet. */
  dataMenyusul: boolean;
  pemegangHak: NewPemegangHak | null;
  pemakaman: NewPemakaman | null;
  /** A Terencana order's Syarat snapshot and Calon Penghuni label, kept on the right its payment granted (ticket 37). */
  syarat?: SyaratHakPakai | null;
  calonPenghuni?: string | null;
}

/** Inserts the Hak Pakai row and, when given, its Pemegang Hak and first Pemakaman; returns the Hak Pakai id. */
export async function grantHakPakai(
  tx: Database,
  now: Date,
  by: { accountId: string },
  input: GrantHakPakaiInput,
): Promise<string> {
  const tenureYears = input.tenure?.kind === "tahun" ? input.tenure.years : null;
  const tenureStartAt = input.pemakaman ? dateOnly(input.pemakaman.date) : null;
  const endDate = tenureStartAt && tenureYears !== null ? dateOnly(addYears(input.pemakaman!.date, tenureYears)) : null;

  const [hakPakai] = await tx
    .insert(inventoryHakPakai)
    .values({
      lokasiId: input.lokasiId,
      petakId: input.petakId,
      kavlingId: input.kavlingId,
      status: "aktif",
      tenureYears,
      startAt: now,
      tenureStartAt,
      endDate,
      perluVerifikasi: input.dataMenyusul,
      syarat: input.syarat ?? null,
      calonPenghuni: input.calonPenghuni ?? null,
      createdAt: now,
      createdByAccountId: by.accountId,
    })
    .returning({ id: inventoryHakPakai.id });

  if (input.pemegangHak) {
    await tx.insert(inventoryPemegangHak).values({
      hakPakaiId: hakPakai.id,
      name: input.pemegangHak.name,
      phoneNumber: input.pemegangHak.phoneNumber,
      email: input.pemegangHak.email ?? null,
      startAt: now,
      createdByAccountId: by.accountId,
    });
  }
  if (input.pemakaman) {
    await tx.insert(inventoryPemakaman).values({
      lokasiId: input.lokasiId,
      petakId: input.pemakaman.petakId,
      hakPakaiId: hakPakai.id,
      almarhumName: input.pemakaman.almarhumName,
      date: input.pemakaman.date,
      layer: input.pemakaman.layer ?? 1,
      createdAt: now,
      createdByAccountId: by.accountId,
    });
  }
  return hakPakai.id;
}

/** "YYYY-MM-DD" as a `Date` at that calendar day's UTC midnight: for `tenure_start_at` / `end_date`, which are dates, not instants — never re-derive a WIB instant from them. */
function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
