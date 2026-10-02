import "server-only";

/** The thread form's fields as the Layanan module's schema reads them: the text and up to three photo files as bytes. */
export async function inputPesanThread(formData: FormData): Promise<{ pekerjaanId: unknown; teks: unknown; foto: { body: Uint8Array; contentType: string }[] }> {
  const berkas = formData.getAll("foto").filter((satu): satu is File => satu instanceof File && satu.size > 0);
  return {
    pekerjaanId: formData.get("pekerjaanId"),
    teks: formData.get("teks") ?? "",
    foto: await Promise.all(berkas.map(async (satu) => ({ body: new Uint8Array(await satu.arrayBuffer()), contentType: satu.type }))),
  };
}
