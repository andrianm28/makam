/**
 * What Inventory does for a Perpanjangan (spec, domain module 5 and 7; ticket
 * 40): the facts the Perpanjangan module needs to decide whether a Hak Pakai can
 * be extended, the extension itself, and the Admin Lokasi's completion of a
 * Perlu Verifikasi Hak Pakai (which must precede the first Perpanjangan).
 *
 * The Hak Pakai's tables are Inventory's, so the end date moves only here. The
 * new end is the old end plus terms x N, where N is the Hak Pakai's own term as
 * it was bought (`tenure_years`), never the Jenis Makam's current tenure and
 * never counted from the day of payment.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, normaliseEmail, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { anggotaKavling, kavlingOf, petakOf } from "./cari-makam";
import { currentPemegangHak } from "./hak-pakai-reads";
import { inventoryHakPakai, inventoryKavling, inventoryPemegangHak, inventoryPetak } from "./schema";
import type { HakPakaiStatus } from "./status";
import { addYears } from "./tenure";

/** A Hak Pakai as a Perpanjangan reads it. Dates are whole calendar dates ("YYYY-MM-DD"). */
export interface HakPakaiUntukPerpanjangan {
  id: string;
  lokasiId: string;
  status: HakPakaiStatus;
  /** The Hak Pakai's own term as bought, in years; null = Selamanya. */
  tenureYears: number | null;
  /** The end of the fixed term; null for a Selamanya Hak Pakai, or while the tenure clock has not started. */
  endDate: string | null;
  perluVerifikasi: boolean;
  /** The Jenis Makam of the Petak (or Kavling Keluarga): what prices a term. */
  jenisMakamId: string | null;
  /** The one Petak, or every Petak of the Kavling Keluarga, by Nomor Makam. */
  petakNomor: string[];
  /** The first of those Petak: the grave a Layanan added at the checkout is ordered for (ticket 53); null when none is on record. */
  petakId: string | null;
  nomorKavling: string | null;
  /** The current Pemegang Hak; null while none is on record ("data menyusul"). */
  pemegangHak: { name: string | null; phoneNumber: string | null; email: string | null } | null;
}

/** The Hak Pakai a Perpanjangan is about, or null for an id that names none. */
export async function hakPakaiUntukPerpanjangan(deps: InventoryDeps, hakPakaiId: string): Promise<HakPakaiUntukPerpanjangan | null> {
  if (!z.uuid().safeParse(hakPakaiId).success) return null;
  const [hak] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, hakPakaiId));
  if (!hak) return null;
  let petak: { id: string; nomorMakam: string }[] = [];
  let nomorKavling: string | null = null;
  let jenisMakamId: string | null = null;
  if (hak.petakId) {
    const satu = await petakOf(deps, hak.lokasiId, hak.petakId);
    petak = satu ? [satu] : [];
    const [row] = await deps.db.select({ jenisMakamId: inventoryPetak.jenisMakamId }).from(inventoryPetak).where(eq(inventoryPetak.id, hak.petakId));
    jenisMakamId = row?.jenisMakamId ?? null;
  } else if (hak.kavlingId) {
    petak = await anggotaKavling(deps, hak.kavlingId);
    const kavling = await kavlingOf(deps, hak.lokasiId, hak.kavlingId);
    nomorKavling = kavling?.nomorKavling ?? null;
    const [row] = await deps.db.select({ jenisMakamId: inventoryKavling.jenisMakamId }).from(inventoryKavling).where(eq(inventoryKavling.id, hak.kavlingId));
    jenisMakamId = row?.jenisMakamId ?? null;
  }
  const pemegang = await currentPemegangHak(deps.db, hak.id);
  return {
    id: hak.id,
    lokasiId: hak.lokasiId,
    status: hak.status,
    tenureYears: hak.tenureYears,
    endDate: hak.endDate ? hak.endDate.toISOString().slice(0, 10) : null,
    perluVerifikasi: hak.perluVerifikasi,
    jenisMakamId,
    petakNomor: petak.map((satu) => satu.nomorMakam),
    petakId: petak[0]?.id ?? null,
    nomorKavling,
    pemegangHak: pemegang ? { name: pemegang.name, phoneNumber: pemegang.phoneNumber, email: pemegang.email } : null,
  };
}

export type PerpanjangHakPakaiResult =
  | { ok: true; endDateLama: string; endDateBaru: string }
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Selamanya Hak Pakai, or one whose end date is not on record: there is nothing to extend. */
  | { ok: false; reason: "tidak_bisa_diperpanjang" }
  /** Berakhir or Dibatalkan: ending is final. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" }
  | { ok: false; reason: "jumlah_masa_tidak_valid" };

/**
 * Extends one Hak Pakai by `terms` of its own term: the end date moves to the
 * old end plus terms x N years, and a Kedaluwarsa Hak Pakai is Aktif again.
 * Driven by the Perpanjangan module inside the transaction that settles the
 * Tagihan (`within`), with no actor: the payment is the permission.
 */
export async function perpanjangHakPakai(
  deps: Pick<InventoryDeps, "db">,
  input: { hakPakaiId: string; terms: number },
): Promise<PerpanjangHakPakaiResult> {
  if (!Number.isInteger(input.terms) || input.terms < 1) return { ok: false, reason: "jumlah_masa_tidak_valid" };
  const [hak] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, input.hakPakaiId)).for("update");
  if (!hak) return { ok: false, reason: "tidak_ditemukan" };
  if (hak.status === "berakhir" || hak.status === "dibatalkan") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if (hak.tenureYears === null || hak.endDate === null) return { ok: false, reason: "tidak_bisa_diperpanjang" };
  const endDateLama = hak.endDate.toISOString().slice(0, 10);
  const endDateBaru = addYears(endDateLama, input.terms * hak.tenureYears);
  await deps.db
    .update(inventoryHakPakai)
    .set({ endDate: new Date(`${endDateBaru}T00:00:00.000Z`), status: "aktif" })
    .where(eq(inventoryHakPakai.id, hak.id));
  return { ok: true, endDateLama, endDateBaru };
}

/** What the Admin Lokasi's "Lengkapi data" form sends for a Perlu Verifikasi Hak Pakai. */
export const lengkapiHakPakaiSchema = z.object({
  hakPakaiId: z.uuid(),
  /** The end date of a fixed-term Hak Pakai whose import had none. */
  endDate: z.iso.date().optional(),
  pemegangHak: z
    .object({
      name: z.string().trim().min(1).max(200),
      phoneNumber: z.string().trim().min(1).max(30),
      email: z.string().trim().max(320).optional(),
    })
    .optional(),
});
export type LengkapiHakPakaiInput = z.infer<typeof lengkapiHakPakaiSchema>;

export type LengkapiHakPakaiResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "hak_pakai_tidak_ditemukan" | "tidak_perlu_verifikasi" }
  | { ok: false; reason: "nomor_telepon_tidak_valid" | "email_tidak_valid" }
  /** A fixed-term Hak Pakai still has no end date, or nobody is on record as its holder: it is not complete. */
  | { ok: false; reason: "tanggal_berakhir_wajib" | "pemegang_hak_wajib" };

/**
 * The Admin Lokasi completes a Perlu Verifikasi Hak Pakai (contact, end date),
 * which clears the flag so a Perpanjangan can proceed (spec, Inventory: "the
 * Admin Lokasi must complete it at the latest at the first Perpanjangan"). Audited.
 */
export async function lengkapiHakPakai(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<LengkapiHakPakaiResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = lengkapiHakPakaiSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const [hak] = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, input.hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hak) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (!hak.perluVerifikasi) return { ok: false, reason: "tidak_perlu_verifikasi" };

  let kontak: { name: string; phoneNumber: string; email: string | null } | null = null;
  if (input.pemegangHak) {
    const phone = normalisePhoneNumber(input.pemegangHak.phoneNumber);
    if (!phone.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };
    let email: string | null = null;
    if (input.pemegangHak.email) {
      email = normaliseEmail(input.pemegangHak.email);
      if (!email) return { ok: false, reason: "email_tidak_valid" };
    }
    kontak = { name: input.pemegangHak.name, phoneNumber: phone.phoneNumber, email };
  }
  const sekarang = await currentPemegangHak(deps.db, hak.id);
  const adaPemegang = kontak !== null || (sekarang?.name != null && sekarang.phoneNumber != null);
  if (!adaPemegang) return { ok: false, reason: "pemegang_hak_wajib" };
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : hak.endDate;
  if (hak.tenureYears !== null && endDate === null) return { ok: false, reason: "tanggal_berakhir_wajib" };

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx.update(inventoryHakPakai).set({ endDate, perluVerifikasi: false }).where(eq(inventoryHakPakai.id, hak.id));
    if (kontak) {
      if (sekarang) {
        await tx.update(inventoryPemegangHak).set(kontak).where(eq(inventoryPemegangHak.id, sekarang.id));
      } else {
        await tx.insert(inventoryPemegangHak).values({ hakPakaiId: hak.id, ...kontak, startAt: now, createdByAccountId: by.accountId });
      }
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.lengkapi",
      entity: { kind: "hak_pakai", id: hak.id },
      lokasiId,
      before: { perluVerifikasi: true, endDate: hak.endDate ? hak.endDate.toISOString().slice(0, 10) : null },
      after: { perluVerifikasi: false, endDate: endDate ? endDate.toISOString().slice(0, 10) : null, kontakDiubah: kontak !== null },
      reason: null,
    });
    return { ok: true as const };
  });
}
