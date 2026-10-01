import { PESAN_FOTO_MAX_BYTES, PESAN_LAMPIRAN_MAX } from "@/domain/layanan/pesan-skema";

/** The photos a thread form attached, converted, or the domain's own reason to refuse the message. */
export type LampiranDari =
  | { ok: true; lampiran: { body: Uint8Array; contentType: string }[] | undefined }
  | { ok: false; reason: "berkas_tidak_didukung" | "input_tidak_valid" };

/**
 * The photos a thread form attached, as the Layanan module's schema takes them. A
 * browser's `File` becomes the bytes and content type the module validates and stores;
 * no file, or a form that carried none, is `undefined`. A file larger than the module's
 * limit is refused here, unread, with the module's own `berkas_tidak_didukung` — never
 * dropped, which would let the action report a success the message did not carry. More
 * files than one message may hold are refused with the schema's `input_tidak_valid`.
 */
export async function lampiranDari(formData: FormData): Promise<LampiranDari> {
  const files = formData.getAll("lampiran").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) return { ok: true, lampiran: undefined };
  if (files.length > PESAN_LAMPIRAN_MAX) return { ok: false, reason: "input_tidak_valid" };
  if (files.some((file) => file.size > PESAN_FOTO_MAX_BYTES)) return { ok: false, reason: "berkas_tidak_didukung" };
  const lampiran = await Promise.all(files.map(async (file) => ({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type })));
  return { ok: true, lampiran };
}
