import { PESAN_FOTO_MAX_BYTES, PESAN_LAMPIRAN_MAX } from "@/domain/layanan/pesan-skema";

/**
 * The photos a thread form attached, as the Layanan module's schema takes them. A
 * browser's `File` becomes the bytes and content type the module validates and stores;
 * no file, or a form that carried none, is `undefined`. Anything larger than the
 * module's own limit is dropped here rather than read into memory, so a huge upload
 * is refused cheaply and the module's rule stays the only one that matters.
 */
export async function lampiranDari(formData: FormData): Promise<{ body: Uint8Array; contentType: string }[] | undefined> {
  const files = formData
    .getAll("lampiran")
    .filter((value): value is File => value instanceof File && value.size > 0 && value.size <= PESAN_FOTO_MAX_BYTES)
    .slice(0, PESAN_LAMPIRAN_MAX);
  if (files.length === 0) return undefined;
  return Promise.all(files.map(async (file) => ({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type })));
}
