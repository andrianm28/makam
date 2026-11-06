/**
 * Info Makam Swasta: what public sources say about private cemeteries (TPS)
 * Makam.co.id is talking to but that are not Lokasi Mitra yet. Admin Platform
 * keeps the list; the public pages only read it. Content, not a Lokasi:
 * nothing here can be ordered or paid, nothing is called Terverifikasi or a
 * partner, and no price is shown (prices found online are mostly agents' or
 * old news), so an entry carrying such a claim is refused. A location that
 * signs becomes a Lokasi Mitra through the normal publish gate, and its entry
 * here is hidden (`tampil` false).
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { semuaLokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { LokasiDeps } from "./lokasi-mitra";
import { lokasiInfoMakamSwasta } from "./schema";
import { infoMakamSwastaSchema, KLAIM_TERLARANG, type InfoMakamSwastaInput } from "./skema-info-makam-swasta";

export interface InfoMakamSwasta extends InfoMakamSwastaInput {
  id: string;
  /** The anchor of its card on /info-makam-swasta. */
  slug: string;
  tampil: boolean;
}

export type SimpanInfoMakamSwastaResult =
  | { ok: true; id: string }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "isian_tidak_valid" | "klaim_terlarang" | "nama_sudah_ada" };

export type AturTampilInfoMakamSwastaResult = { ok: true } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

type Row = typeof lokasiInfoMakamSwasta.$inferSelect;

function dariRow(row: Row): InfoMakamSwasta {
  return {
    id: row.id,
    slug: row.slug,
    nama: row.nama,
    kota: row.kota,
    alamat: row.alamat,
    pengelola: row.pengelola,
    segmen: row.segmen,
    luas: row.luas,
    fasilitas: row.fasilitas,
    sumber: row.sumber,
    urutan: row.urutan,
    tampil: row.tampil,
  };
}

const urut = [asc(lokasiInfoMakamSwasta.urutan), asc(lokasiInfoMakamSwasta.nama)];

/** The entries the public pages show, in Admin Platform's order (no actor). */
export async function infoMakamSwastaTayang(deps: Pick<LokasiDeps, "db">): Promise<InfoMakamSwasta[]> {
  const rows = await deps.db
    .select()
    .from(lokasiInfoMakamSwasta)
    .where(eq(lokasiInfoMakamSwasta.tampil, true))
    .orderBy(...urut);
  return rows.map(dariRow);
}

/** Every entry, shown or hidden, for Admin Platform; empty for anyone else. */
export async function semuaInfoMakamSwasta(deps: Pick<LokasiDeps, "db">, by: Actor): Promise<InfoMakamSwasta[]> {
  if (writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource())) return [];
  const rows = await deps.db.select().from(lokasiInfoMakamSwasta).orderBy(...urut);
  return rows.map(dariRow);
}

/** "BAQI Memorial Park Bogor Timur" → "baqi-memorial-park-bogor-timur". */
export function slugInfoMakamSwasta(nama: string): string {
  return (
    nama
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "lokasi"
  );
}

const idSah = (id: string) => z.uuid().safeParse(id).success;

/**
 * Admin Platform adds an entry (`id` null) or corrects one. Validated here
 * too, and refused when any text claims a partnership, a verification or a
 * price. Audited with the before and after values.
 */
export async function simpanInfoMakamSwasta(
  deps: LokasiDeps,
  by: Actor,
  id: string | null,
  input: unknown,
): Promise<SimpanInfoMakamSwastaResult> {
  const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
  if (refusal) return refusal;
  if (id !== null && !idSah(id)) return { ok: false, reason: "tidak_ditemukan" };
  const parsed = infoMakamSwastaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "isian_tidak_valid" };
  const data = parsed.data;
  if (KLAIM_TERLARANG.test(JSON.stringify({ ...data, urutan: undefined }))) return { ok: false, reason: "klaim_terlarang" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const lama = id === null ? null : (await tx.select().from(lokasiInfoMakamSwasta).where(eq(lokasiInfoMakamSwasta.id, id)).for("update"))[0];
    if (id !== null && !lama) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const slug = lama?.slug ?? slugInfoMakamSwasta(data.nama);
    const kembar = await tx
      .select({ id: lokasiInfoMakamSwasta.id })
      .from(lokasiInfoMakamSwasta)
      .where(lama ? and(eq(lokasiInfoMakamSwasta.nama, data.nama), ne(lokasiInfoMakamSwasta.id, lama.id)) : eq(lokasiInfoMakamSwasta.slug, slug));
    if (kembar.length > 0) return { ok: false as const, reason: "nama_sudah_ada" as const };

    const nilai = { ...data, updatedAt: now };
    const [simpan] = lama
      ? await tx.update(lokasiInfoMakamSwasta).set(nilai).where(eq(lokasiInfoMakamSwasta.id, lama.id)).returning()
      : await tx
          .insert(lokasiInfoMakamSwasta)
          .values({ ...nilai, slug, createdAt: now })
          .returning();
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "lokasi.ubah_info_makam_swasta",
      entity: { kind: "info_makam_swasta", id: simpan.id },
      before: lama ? { ...dariRow(lama) } : null,
      after: { ...dariRow(simpan) },
      reason: null,
    });
    return { ok: true as const, id: simpan.id };
  });
}

/** Admin Platform shows an entry on the public pages again, or takes it off them; audited. */
export async function aturTampilInfoMakamSwasta(
  deps: LokasiDeps,
  by: Actor,
  id: string,
  tampil: boolean,
): Promise<AturTampilInfoMakamSwastaResult> {
  const refusal = writeRefusal(by, "lokasi.buat", semuaLokasiMitraResource());
  if (refusal) return refusal;
  if (!idSah(id)) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(lokasiInfoMakamSwasta).where(eq(lokasiInfoMakamSwasta.id, id)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.tampil === tampil) return { ok: true as const };
    await tx.update(lokasiInfoMakamSwasta).set({ tampil, updatedAt: now }).where(eq(lokasiInfoMakamSwasta.id, id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "lokasi.ubah_info_makam_swasta",
      entity: { kind: "info_makam_swasta", id },
      before: { tampil: row.tampil },
      after: { tampil },
      reason: null,
    });
    return { ok: true as const };
  });
}
