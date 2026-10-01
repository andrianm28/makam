import { describe, expect, it } from "vitest";
import { PESAN_FOTO_MAX_BYTES, PESAN_LAMPIRAN_MAX } from "@/domain/layanan/pesan-skema";
import { lampiranDari } from "./form-lampiran";

/** A form as the browser built it: the photos under the `lampiran` field. */
function formulir(files: File[]): FormData {
  const data = new FormData();
  for (const file of files) data.append("lampiran", file);
  return data;
}

const jpeg = (bytes: number, name = "foto.jpg") => new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

/** The photos a thread form attached, as the Layanan module's schema takes them. */
describe("the photos a thread form attached", () => {
  it("refuses a photo larger than the Layanan limit with the domain's own error, instead of dropping it", async () => {
    expect(await lampiranDari(formulir([jpeg(PESAN_FOTO_MAX_BYTES + 1, "besar.jpg")]))).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
  });

  it("refuses more photos than one message may carry, instead of dropping the extra", async () => {
    const terlalu = Array.from({ length: PESAN_LAMPIRAN_MAX + 1 }, (_satu, index) => jpeg(8, `foto-${index}.jpg`));
    expect(await lampiranDari(formulir(terlalu))).toEqual({ ok: false, reason: "input_tidak_valid" });
  });

  it("converts an accepted photo to the bytes and content type the module stores", async () => {
    const hasil = await lampiranDari(formulir([jpeg(8)]));
    expect(hasil).toMatchObject({ ok: true, lampiran: [{ contentType: "image/jpeg" }] });
    if (!hasil.ok) throw new Error("refused");
    expect(hasil.lampiran?.[0].body).toBeInstanceOf(Uint8Array);
    expect(hasil.lampiran?.[0].body.byteLength).toBe(8);
  });

  it("carries no photos when the form attached none", async () => {
    expect(await lampiranDari(new FormData())).toEqual({ ok: true, lampiran: undefined });
  });
});
