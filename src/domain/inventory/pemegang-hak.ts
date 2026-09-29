/**
 * Who holds a Hak Pakai, as an Admin Lokasi records it after checking a
 * document (spec, Inventory > Hak Pakai; Perpanjangan, manual paths; ticket 41).
 *
 * Two writes, both Admin Lokasi of that Lokasi Mitra only and both audited in
 * their own Entri Audit:
 * - `gantiPemegangHak` closes the current holder's row and opens the new one, so
 *   every earlier Pemegang Hak stays in the history with its dates (the heir and
 *   claim paths);
 * - `ubahKontakPemegangHak` changes the recorded phone number and email of the
 *   holder in place after a KTP check (the KTP path).
 *
 * The audit entry never carries a phone number or an email: only the last 4
 * digits of the number and whether an email is recorded.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, normaliseEmail, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai, inventoryPemegangHak } from "./schema";

const kontakSchema = z.object({
  phoneNumber: z.string().trim().min(1).max(30),
  email: z.string().trim().max(320).optional(),
});

export const gantiPemegangHakSchema = z.object({
  hakPakaiId: z.uuid(),
  pemegangHak: kontakSchema.extend({ name: z.string().trim().min(1).max(200) }),
  alasan: z.string().trim().min(1).max(300),
});
export type GantiPemegangHakInput = z.infer<typeof gantiPemegangHakSchema>;

export const ubahKontakPemegangHakSchema = z.object({
  hakPakaiId: z.uuid(),
  /** Only needed when the Hak Pakai has no holder on record yet ("data menyusul"). */
  name: z.string().trim().min(1).max(200).optional(),
  phoneNumber: z.string().trim().min(1).max(30),
  email: z.string().trim().max(320).optional(),
  alasan: z.string().trim().min(1).max(300),
});
export type UbahKontakPemegangHakInput = z.infer<typeof ubahKontakPemegangHakSchema>;

export type PemegangHakResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "hak_pakai_tidak_ditemukan" | "hak_pakai_sudah_berakhir" }
  | { ok: false; reason: "nomor_telepon_tidak_valid" | "email_tidak_valid" }
  /** A holder has to be named when none is on record. */
  | { ok: false; reason: "nama_wajib" };

/** "***1234": enough to tell two numbers apart in the Audit Log, never enough to call. */
function akhirEmpat(phoneNumber: string | null): string | null {
  return phoneNumber ? `***${phoneNumber.slice(-4)}` : null;
}

/** The Hak Pakai of that Lokasi Mitra that can still change hands, or why not. */
async function hakPakaiOf(deps: InventoryDeps, lokasiId: string, hakPakaiId: string) {
  const [hak] = await deps.db
    .select({ id: inventoryHakPakai.id, status: inventoryHakPakai.status })
    .from(inventoryHakPakai)
    .where(and(eq(inventoryHakPakai.id, hakPakaiId), eq(inventoryHakPakai.lokasiId, lokasiId)));
  if (!hak) return { ok: false as const, reason: "hak_pakai_tidak_ditemukan" as const };
  if (hak.status === "berakhir" || hak.status === "dibatalkan") return { ok: false as const, reason: "hak_pakai_sudah_berakhir" as const };
  return { ok: true as const };
}

/** The phone number and the optional email, normalised, or the reason one is refused. */
function kontakOf(input: { phoneNumber: string; email?: string }) {
  const phone = normalisePhoneNumber(input.phoneNumber);
  if (!phone.ok) return { ok: false as const, reason: "nomor_telepon_tidak_valid" as const };
  let email: string | null = null;
  if (input.email) {
    email = normaliseEmail(input.email);
    if (!email) return { ok: false as const, reason: "email_tidak_valid" as const };
  }
  return { ok: true as const, phoneNumber: phone.phoneNumber, email };
}

/** Records a new Pemegang Hak on a Hak Pakai: the current holder's row ends now and the history keeps it. */
export async function gantiPemegangHak(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<PemegangHakResult> {
  const refusal = writeRefusal(by, "hak_pakai.ubah_pemegang", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = gantiPemegangHakSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const hak = await hakPakaiOf(deps, lokasiId, input.hakPakaiId);
  if (!hak.ok) return hak;
  const kontak = kontakOf(input.pemegangHak);
  if (!kontak.ok) return kontak;

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lama] = await tx
      .select()
      .from(inventoryPemegangHak)
      .where(and(eq(inventoryPemegangHak.hakPakaiId, input.hakPakaiId), isNull(inventoryPemegangHak.endAt)))
      .for("update");
    if (lama) await tx.update(inventoryPemegangHak).set({ endAt: now }).where(eq(inventoryPemegangHak.id, lama.id));
    await tx.insert(inventoryPemegangHak).values({
      hakPakaiId: input.hakPakaiId,
      name: input.pemegangHak.name,
      phoneNumber: kontak.phoneNumber,
      email: kontak.email,
      startAt: now,
      createdByAccountId: by.accountId,
    });
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.ganti_pemegang",
      entity: { kind: "hak_pakai", id: input.hakPakaiId },
      lokasiId,
      before: lama ? { nama: lama.name, telepon: akhirEmpat(lama.phoneNumber), emailTercatat: lama.email !== null } : null,
      after: { nama: input.pemegangHak.name, telepon: akhirEmpat(kontak.phoneNumber), emailTercatat: kontak.email !== null },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}

/** Changes the recorded phone number and email of the current Pemegang Hak after a KTP check (its name and history stay). */
export async function ubahKontakPemegangHak(deps: InventoryDeps, by: Actor, lokasiId: string, rawInput: unknown): Promise<PemegangHakResult> {
  const refusal = writeRefusal(by, "hak_pakai.ubah_pemegang", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = ubahKontakPemegangHakSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const hak = await hakPakaiOf(deps, lokasiId, input.hakPakaiId);
  if (!hak.ok) return hak;
  const kontak = kontakOf(input);
  if (!kontak.ok) return kontak;

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [sekarang] = await tx
      .select()
      .from(inventoryPemegangHak)
      .where(and(eq(inventoryPemegangHak.hakPakaiId, input.hakPakaiId), isNull(inventoryPemegangHak.endAt)))
      .for("update");
    const nama = input.name ?? sekarang?.name ?? null;
    if (!nama) return { ok: false as const, reason: "nama_wajib" as const };
    if (sekarang) {
      await tx
        .update(inventoryPemegangHak)
        .set({ name: nama, phoneNumber: kontak.phoneNumber, email: kontak.email })
        .where(eq(inventoryPemegangHak.id, sekarang.id));
    } else {
      await tx.insert(inventoryPemegangHak).values({
        hakPakaiId: input.hakPakaiId,
        name: nama,
        phoneNumber: kontak.phoneNumber,
        email: kontak.email,
        startAt: now,
        createdByAccountId: by.accountId,
      });
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.ubah_kontak_pemegang",
      entity: { kind: "hak_pakai", id: input.hakPakaiId },
      lokasiId,
      before: sekarang ? { telepon: akhirEmpat(sekarang.phoneNumber), emailTercatat: sekarang.email !== null } : null,
      after: { telepon: akhirEmpat(kontak.phoneNumber), emailTercatat: kontak.email !== null },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}

/** One holder of a Hak Pakai in its history: the name and the dates, never the contact. */
export interface RiwayatPemegangHak {
  name: string | null;
  startAt: Date;
  /** Null for the current holder. */
  endAt: Date | null;
}

/** Every Pemegang Hak the Hak Pakai has had, oldest first. */
export async function riwayatPemegangHak(deps: Pick<InventoryDeps, "db">, hakPakaiId: string): Promise<RiwayatPemegangHak[]> {
  return deps.db
    .select({ name: inventoryPemegangHak.name, startAt: inventoryPemegangHak.startAt, endAt: inventoryPemegangHak.endAt })
    .from(inventoryPemegangHak)
    .where(eq(inventoryPemegangHak.hakPakaiId, hakPakaiId))
    .orderBy(asc(inventoryPemegangHak.startAt));
}
