/** The Nazhir list: kept by Admin Platform in the dashboard, never seeded. A Nazhir has no login. */
import { asc, eq } from "drizzle-orm";
import { wakafResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { WakafDeps } from "./deps";

/** What the Nazhir list needs: no files, Field Work or Notifications, so a caller that only keeps the list composes only these. */
export type NazhirDeps = Pick<WakafDeps, "db" | "clock" | "audit">;
import { wakafNazhir, type JenisNazhir } from "./schema";
import { hapusNazhirSchema, nazhirInputSchema, ubahNazhirSchema } from "./skema";

export interface Nazhir {
  id: string;
  nama: string;
  jenis: JenisNazhir;
  kabKota: string;
  kontak: string;
  nomorBwi: string;
}

/** What a Wakif choosing a Nazhir on the form sees: no contact, no BWI number. */
export type NazhirPilihan = Pick<Nazhir, "id" | "nama" | "jenis" | "kabKota">;

export type NazhirResult = { ok: true; nazhir: Nazhir } | WriteRefusal | { ok: false; reason: "input_tidak_valid" | "nazhir_tidak_ditemukan" };

const pilih = {
  id: wakafNazhir.id,
  nama: wakafNazhir.nama,
  jenis: wakafNazhir.jenis,
  kabKota: wakafNazhir.kabKota,
  kontak: wakafNazhir.kontak,
  nomorBwi: wakafNazhir.nomorBwi,
};

/** The whole list with contact and BWI number: Admin Platform only (empty for anyone else). */
export async function daftarNazhir(deps: NazhirDeps, by: Actor): Promise<Nazhir[]> {
  if (writeRefusal(by, "wakaf.kelola", wakafResource())) return [];
  return deps.db.select(pilih).from(wakafNazhir).orderBy(asc(wakafNazhir.nama));
}

/** The list the Pengajuan form offers: names only, no sign-in needed. */
export async function nazhirUntukPilihan(deps: NazhirDeps): Promise<NazhirPilihan[]> {
  return deps.db
    .select({ id: wakafNazhir.id, nama: wakafNazhir.nama, jenis: wakafNazhir.jenis, kabKota: wakafNazhir.kabKota })
    .from(wakafNazhir)
    .orderBy(asc(wakafNazhir.nama));
}

export async function tambahNazhir(deps: NazhirDeps, by: Actor, raw: unknown): Promise<NazhirResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = nazhirInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.insert(wakafNazhir).values({ ...parsed.data, dibuatPada: now, diubahPada: now }).returning(pilih);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "wakaf.nazhir_tambah",
      entity: { kind: "nazhir", id: row!.id },
      before: null,
      after: { nama: row!.nama, jenis: row!.jenis, kabKota: row!.kabKota },
      reason: null,
    });
    return { ok: true as const, nazhir: row! };
  });
}

export async function ubahNazhir(deps: NazhirDeps, by: Actor, raw: unknown): Promise<NazhirResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = ubahNazhirSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { nazhirId, ...nilai } = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lama] = await tx.select(pilih).from(wakafNazhir).where(eq(wakafNazhir.id, nazhirId)).for("update");
    if (!lama) return { ok: false as const, reason: "nazhir_tidak_ditemukan" as const };
    const [baru] = await tx.update(wakafNazhir).set({ ...nilai, diubahPada: deps.clock.now() }).where(eq(wakafNazhir.id, nazhirId)).returning(pilih);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "wakaf.nazhir_ubah",
      entity: { kind: "nazhir", id: nazhirId },
      before: { nama: lama.nama, jenis: lama.jenis, kabKota: lama.kabKota },
      after: { nama: baru!.nama, jenis: baru!.jenis, kabKota: baru!.kabKota },
      reason: null,
    });
    return { ok: true as const, nazhir: baru! };
  });
}

/** Removes a Nazhir from the list; Pengajuan that already name it keep the name as it stood. */
export async function hapusNazhir(deps: NazhirDeps, by: Actor, raw: unknown): Promise<NazhirResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = hapusNazhirSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [lama] = await tx.delete(wakafNazhir).where(eq(wakafNazhir.id, parsed.data.nazhirId)).returning(pilih);
    if (!lama) return { ok: false as const, reason: "nazhir_tidak_ditemukan" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "wakaf.nazhir_hapus",
      entity: { kind: "nazhir", id: lama.id },
      before: { nama: lama.nama, jenis: lama.jenis, kabKota: lama.kabKota },
      after: null,
      reason: null,
    });
    return { ok: true as const, nazhir: lama };
  });
}
