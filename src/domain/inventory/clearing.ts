/**
 * Petak Makam / Kavling Keluarga clearing (spec, Inventory > Denah; story
 * 128): the Admin Lokasi clears a newly drawn Petak (or a whole Kavling
 * Keluarga) as Tersedia, Tidak Tersedia with a reason, or occupied — recording
 * a minimal Hak Pakai with its Pemegang Hak and, when known, its first
 * Pemakaman, or deferring all of that as "data menyusul". This is how
 * existing graves get into the platform before any Excel import exists.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, normaliseEmail, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { foldKey } from "./ids";
import { currentHakPakaiOfKavling, currentHakPakaiOfPetak } from "./hak-pakai-reads";
import { lockBlok, lockLokasiInventory } from "./locks";
import { inventoryHakPakai, inventoryKavling, inventoryPemakaman, inventoryPemegangHak, inventoryPetak } from "./schema";
import { addYears, tenureOfJenisMakam } from "./tenure";

const pemegangHakSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(1).max(30),
  email: z.string().trim().max(320).optional(),
});

const pemakamanSchema = z.object({
  almarhumName: z.string().trim().min(1).max(200),
  date: z.iso.date(),
  layer: z.number().int().min(1).max(20).optional(),
});

const clearingModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("tersedia") }),
  z.object({ mode: z.literal("tidak_tersedia"), reason: z.string().trim().min(1).max(300) }),
  z.object({ mode: z.literal("terisi"), dataMenyusul: z.boolean(), pemegangHak: pemegangHakSchema.optional(), pemakaman: pemakamanSchema.optional() }),
]);

export type NewPemegangHak = z.infer<typeof pemegangHakSchema>;
export type NewPemakaman = z.infer<typeof pemakamanSchema>;
export type ClearingInput = z.infer<typeof clearingModeSchema>;
/** For a Server Action's own Zod boundary validation (AGENTS.md): the same shape `clearPetak` itself validates. */
export { clearingModeSchema as petakClearingSchema };

type NotFoundKavling = { ok: false; reason: "kavling_tidak_ditemukan" };

export type ClearingResult =
  | { ok: true; hakPakaiId: string | null }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "petak_tidak_ditemukan" }
  | { ok: false; reason: "bagian_kavling" }
  | { ok: false; reason: "sudah_ada_hak_pakai" }
  | { ok: false; reason: "pemegang_hak_wajib" }
  | { ok: false; reason: "nomor_telepon_tidak_valid" }
  | { ok: false; reason: "email_tidak_valid" }
  | { ok: false; reason: "pemegang_hak_adalah_almarhum" };

/** Whether `name` (the Pemegang Hak) is, folded, the same person as `almarhum` — never allowed (spec). */
function samePerson(name: string, almarhum: string): boolean {
  return foldKey(name) === foldKey(almarhum);
}

/** Validates and normalises a clearing "terisi" mode's Pemegang Hak / Pemakaman, common to a Petak and a Kavling Keluarga. */
function validateOccupied(input: Extract<ClearingInput, { mode: "terisi" }>): ClearingResult | { pemegangHak: NewPemegangHak | null; pemakaman: NewPemakaman | null } {
  if (!input.dataMenyusul && !input.pemegangHak) return { ok: false, reason: "pemegang_hak_wajib" };
  let phoneNumber: string | null = null;
  if (input.pemegangHak) {
    const phone = normalisePhoneNumber(input.pemegangHak.phoneNumber);
    if (!phone.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };
    phoneNumber = phone.phoneNumber;
    if (input.pemegangHak.email) {
      const email = normaliseEmail(input.pemegangHak.email);
      if (!email) return { ok: false, reason: "email_tidak_valid" };
    }
    if (input.pemakaman && samePerson(input.pemegangHak.name, input.pemakaman.almarhumName)) {
      return { ok: false, reason: "pemegang_hak_adalah_almarhum" };
    }
  }
  return {
    pemegangHak: input.pemegangHak ? { ...input.pemegangHak, phoneNumber: phoneNumber!, email: input.pemegangHak.email ? normaliseEmail(input.pemegangHak.email)! : undefined } : null,
    pemakaman: input.pemakaman ?? null,
  };
}

/** Clears one Petak Makam: Tersedia, Tidak Tersedia (with a reason) or occupied. Refused once it already has a Hak Pakai, or is part of a Kavling Keluarga (clear that instead). */
export async function clearPetak(deps: InventoryDeps, by: Actor, lokasiId: string, petakId: string, rawInput: unknown): Promise<ClearingResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = clearingModeSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };

  const [petak] = await deps.db
    .select()
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.id, petakId), eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.kind, "petak")));
  if (!petak) return { ok: false, reason: "petak_tidak_ditemukan" };
  if (petak.kavlingId) return { ok: false, reason: "bagian_kavling" };
  if (await currentHakPakaiOfPetak(deps.db, petakId)) return { ok: false, reason: "sudah_ada_hak_pakai" };

  const now = deps.clock.now();
  const input = parsed.data;
  if (input.mode === "tersedia") {
    return deps.audit.staffWrite(deps.db, async (tx, record) => {
      await lockBlok(tx, petak.blokId);
      await tx.update(inventoryPetak).set({ perluVerifikasi: false, tidakTersediaReason: null }).where(eq(inventoryPetak.id, petakId));
      await record(clearingAuditEntry(by, lokasiId, petakId, petak.nomorMakam, { mode: "tersedia" }));
      return { ok: true as const, hakPakaiId: null };
    });
  }
  if (input.mode === "tidak_tersedia") {
    const reason = input.reason;
    return deps.audit.staffWrite(deps.db, async (tx, record) => {
      await lockBlok(tx, petak.blokId);
      await tx.update(inventoryPetak).set({ perluVerifikasi: false, tidakTersediaReason: reason }).where(eq(inventoryPetak.id, petakId));
      await record(clearingAuditEntry(by, lokasiId, petakId, petak.nomorMakam, { mode: "tidak_tersedia", reason }));
      return { ok: true as const, hakPakaiId: null };
    });
  }

  const dataMenyusul = input.dataMenyusul;
  const occupied = validateOccupied(input);
  if ("ok" in occupied) return occupied;
  if (!petak.jenisMakamId) return { ok: false, reason: "petak_tidak_ditemukan" };
  const tenure = await tenureOfJenisMakam(deps, by, lokasiId, petak.jenisMakamId);

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, petak.blokId);
    await lockLokasiInventory(tx, lokasiId);
    const hakPakaiId = await grantHakPakai(tx, deps.clock.now(), by, {
      lokasiId,
      petakId,
      kavlingId: null,
      tenure,
      dataMenyusul,
      pemegangHak: occupied.pemegangHak,
      pemakaman: occupied.pemakaman ? { ...occupied.pemakaman, petakId } : null,
    });
    await tx.update(inventoryPetak).set({ perluVerifikasi: false, tidakTersediaReason: null, firstUsedAt: now }).where(eq(inventoryPetak.id, petakId));
    await record(
      clearingAuditEntry(by, lokasiId, petakId, petak.nomorMakam, {
        mode: "terisi",
        dataMenyusul,
        hakPakaiId,
        almarhum: occupied.pemakaman?.almarhumName ?? null,
      }),
    );
    return { ok: true as const, hakPakaiId };
  });
}

/** Clears a whole Kavling Keluarga: Tersedia (clears every member Petak's Perlu Verifikasi) or occupied (one Hak Pakai for the whole Kavling; its first Pemakaman, if given, names one member Petak). There is no manual Tidak Tersedia for a Kavling Keluarga (spec lists none). */
const kavlingPemakamanSchema = pemakamanSchema.extend({ petakId: z.uuid() });
const kavlingClearingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("tersedia") }),
  z.object({ mode: z.literal("terisi"), dataMenyusul: z.boolean(), pemegangHak: pemegangHakSchema.optional(), pemakaman: kavlingPemakamanSchema.optional() }),
]);
export { kavlingClearingSchema };

export type ClearKavlingResult = ClearingResult | NotFoundKavling | { ok: false; reason: "petak_bukan_anggota_kavling" };

export async function clearKavling(deps: InventoryDeps, by: Actor, lokasiId: string, kavlingId: string, rawInput: unknown): Promise<ClearKavlingResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = kavlingClearingSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };

  const [kavling] = await deps.db.select().from(inventoryKavling).where(and(eq(inventoryKavling.id, kavlingId), eq(inventoryKavling.lokasiId, lokasiId)));
  if (!kavling) return { ok: false, reason: "kavling_tidak_ditemukan" };
  if (await currentHakPakaiOfKavling(deps.db, kavlingId)) return { ok: false, reason: "sudah_ada_hak_pakai" };
  const members = await deps.db.select().from(inventoryPetak).where(eq(inventoryPetak.kavlingId, kavlingId));
  const memberIds = members.map((member) => member.id);

  const now = deps.clock.now();
  if (parsed.data.mode === "tersedia") {
    return deps.audit.staffWrite(deps.db, async (tx, record) => {
      await lockBlok(tx, kavling.blokId);
      if (memberIds.length) await tx.update(inventoryPetak).set({ perluVerifikasi: false }).where(inArray(inventoryPetak.id, memberIds));
      await record(clearingAuditEntry(by, lokasiId, kavlingId, kavling.nomorKavling, { mode: "tersedia" }, "denah_kavling"));
      return { ok: true as const, hakPakaiId: null };
    });
  }

  const occupiedInput = parsed.data;
  const occupied = validateOccupied(occupiedInput);
  if ("ok" in occupied) return occupied;
  if (occupiedInput.pemakaman && !memberIds.includes(occupiedInput.pemakaman.petakId)) {
    return { ok: false, reason: "petak_bukan_anggota_kavling" };
  }
  const tenure = await tenureOfJenisMakam(deps, by, lokasiId, kavling.jenisMakamId);

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, kavling.blokId);
    await lockLokasiInventory(tx, lokasiId);
    const hakPakaiId = await grantHakPakai(tx, deps.clock.now(), by, {
      lokasiId,
      petakId: null,
      kavlingId,
      tenure,
      dataMenyusul: occupiedInput.dataMenyusul,
      pemegangHak: occupied.pemegangHak,
      pemakaman: occupiedInput.pemakaman ?? null,
    });
    if (memberIds.length) await tx.update(inventoryPetak).set({ perluVerifikasi: false }).where(inArray(inventoryPetak.id, memberIds));
    if (occupiedInput.pemakaman) await tx.update(inventoryPetak).set({ firstUsedAt: now }).where(eq(inventoryPetak.id, occupiedInput.pemakaman.petakId));
    await tx.update(inventoryKavling).set({ firstUsedAt: now }).where(eq(inventoryKavling.id, kavlingId));
    await record(
      clearingAuditEntry(
        by,
        lokasiId,
        kavlingId,
        kavling.nomorKavling,
        { mode: "terisi", dataMenyusul: occupiedInput.dataMenyusul, hakPakaiId, almarhum: occupiedInput.pemakaman?.almarhumName ?? null },
        "denah_kavling",
      ),
    );
    return { ok: true as const, hakPakaiId };
  });
}

/** Inserts the Hak Pakai row and, when given, its Pemegang Hak and first Pemakaman; returns the Hak Pakai id. Shared by `clearPetak` and `clearKavling`. */
async function grantHakPakai(
  tx: InventoryDeps["db"],
  now: Date,
  by: Actor,
  input: {
    lokasiId: string;
    petakId: string | null;
    kavlingId: string | null;
    tenure: Awaited<ReturnType<typeof tenureOfJenisMakam>>;
    dataMenyusul: boolean;
    pemegangHak: NewPemegangHak | null;
    pemakaman: (NewPemakaman & { petakId: string }) | null;
  },
): Promise<string> {
  const tenureYears = input.tenure?.kind === "tahun" ? input.tenure.years : null;
  // The tenure clock starts at the first Pemakaman's own (calendar) date, never "now": this clearing flow
  // routinely enters a burial that happened long before the Admin Lokasi types it in.
  const tenureStartAt = input.pemakaman ? dateOnly(input.pemakaman.date) : null;
  const endDate = tenureStartAt && tenureYears !== null ? dateOnly(addYears(input.pemakaman!.date, tenureYears)) : null;
  const perluVerifikasi = input.dataMenyusul;

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
      perluVerifikasi,
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

function clearingAuditEntry(
  by: Actor,
  lokasiId: string,
  entityId: string,
  nomor: string | null,
  after: Record<string, unknown>,
  entityKind: "denah_petak" | "denah_kavling" = "denah_petak",
) {
  return {
    actor: { accountId: by.accountId, role: "admin_lokasi" as const },
    action: "denah.bersihkan_petak" as const,
    entity: { kind: entityKind, id: entityId },
    lokasiId,
    before: { nomor },
    after,
    reason: null,
  };
}
