/**
 * The documents of a manual request: checked (type, content, size), stored only in the private
 * FileStore, and read back from the row through one schema. A document stored for a request that then
 * fails is deleted again (best-effort), so a refusal leaves no private file behind.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { PerpanjanganDeps } from "./deps";
import { BERKAS_PERMOHONAN_MAX_BYTES, berkasUntukJalur, type berkasInputSchema, type JalurManual, type PermohonanRefusal } from "./permohonan-skema";
import type { BerkasPermohonan, perpanjanganPermohonan } from "./schema";

/** A document may be a photo of a paper or a scan of it (its size limit is `BERKAS_PERMOHONAN_MAX_BYTES`). */
const BERKAS_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The stored documents of a request as the row keeps them (jsonb), validated on the way out. */
export const berkasPermohonanSchema = z.array(
  z.object({ kunci: z.string(), fileKey: z.string(), contentType: z.string(), diunggahPada: z.string() }),
);

/** A request's stored documents, or an error when the row holds something that is not a list of them. */
export function berkasDari(row: Pick<typeof perpanjanganPermohonan.$inferSelect, "berkas">): BerkasPermohonan[] {
  return berkasPermohonanSchema.parse(row.berkas);
}

type BerkasInput = z.infer<typeof berkasInputSchema>;

/** Deletes stored documents, best-effort: a file that cannot be deleted is left for the operator, never a reason to fail. */
export async function hapusBerkas(deps: Pick<PerpanjanganDeps, "files">, berkas: readonly BerkasPermohonan[]): Promise<void> {
  await Promise.all(berkas.map((satu) => deps.files.delete(satu.fileKey).catch(() => undefined)));
}

/** Checks every document that came in (type, content, size) and stores it privately; stores nothing when one is refused. */
export async function simpanBerkas(
  deps: PerpanjanganDeps,
  permohonanId: string,
  jalur: JalurManual,
  masuk: readonly BerkasInput[],
  now: Date,
): Promise<{ ok: true; berkas: BerkasPermohonan[] } | PermohonanRefusal> {
  const dikenal = new Set(berkasUntukJalur(jalur).map((satu) => satu.kunci));
  const terakhir = new Map<string, BerkasInput>();
  for (const berkas of masuk) {
    if (berkas.body.byteLength === 0) continue;
    if (!dikenal.has(berkas.kunci)) return { ok: false, reason: "input_tidak_valid" };
    terakhir.set(berkas.kunci, berkas);
  }
  for (const [kunci, berkas] of terakhir) {
    const extension = documentExtension(berkas, BERKAS_TYPES);
    if (!extension || berkas.body.byteLength > BERKAS_PERMOHONAN_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung", kunci };
  }
  const hasil: BerkasPermohonan[] = [];
  for (const [kunci, berkas] of terakhir) {
    const extension = documentExtension(berkas, BERKAS_TYPES)!;
    const fileKey = `perpanjangan-permohonan/${permohonanId}/${kunci}-${randomUUID()}.${extension}`;
    try {
      await deps.files.put({ key: fileKey, body: berkas.body, contentType: berkas.contentType });
    } catch {
      await hapusBerkas(deps, hasil);
      return { ok: false, reason: "penyimpanan_belum_tersedia" };
    }
    hasil.push({ kunci, fileKey, contentType: berkas.contentType, diunggahPada: now.toISOString() });
  }
  return { ok: true, berkas: hasil };
}

/** The first required document a path still lacks, or null when it has them all. */
export function berkasKurang(jalur: JalurManual, ada: readonly BerkasPermohonan[]): string | null {
  const kunci = new Set(ada.map((satu) => satu.kunci));
  return berkasUntukJalur(jalur).find((satu) => satu.wajib && !kunci.has(satu.kunci))?.kunci ?? null;
}
