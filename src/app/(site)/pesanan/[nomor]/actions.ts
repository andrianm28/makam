"use server";

import { revalidatePath } from "next/cache";
import { pemesananResource } from "@/domain/identity";
import { DOKUMEN_MAX_BYTES, unggahDokumenSchema } from "@/domain/pemesanan";
import { pemesananMessage } from "@/lib/pemesanan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type DokumenActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/** The document types a family may add: a photo of a paper or a scan of it. */
const JENIS_BERKAS = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/**
 * A family adds a document to its own order, at any time (spec, story 30: papers
 * may follow, even after the burial; nothing here waits for a confirmation).
 */
export async function unggahDokumenAction(_previous: DokumenActionState, formData: FormData): Promise<DokumenActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const file = formData.get("berkas");
  const nama = String(formData.get("nama") ?? "");

  const result = await guarded({
    action: "pemesanan.unggah_dokumen",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: unggahDokumenSchema,
    input: {
      nomor,
      nama,
      file:
        file instanceof File && file.size > 0
          ? { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type }
          : { body: new Uint8Array(), contentType: "" },
    },
    run: async (actor, data) => {
      const pemesanan = serverRuntime().pemesanan;
      // The order is the caller's own: the account that placed it.
      const email = actor.email;
      return pemesanan.unggahDokumen({ accountId: actor.accountId, email }, data);
    },
  });
  if (!result.ok) {
    // A session that ended while the family was choosing a file says so in the family's
    // own words; every other guard refusal is the module's, and it speaks for itself.
    if (result.error === "belum_masuk") return { status: "gagal", message: "Silakan masuk lagi untuk mengunggah dokumen." };
    return { status: "gagal", message: pemesananMessage(result.error) };
  }
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: unggahMessage(result.value.reason) };
  return { status: "berhasil", message: `${result.value.nama} diterima. Terima kasih.` };
}

function unggahMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return "Pesanan ini tidak ditemukan.";
    case "dokumen_tidak_dikenal":
      return "Pilih dokumen dari daftar yang Lokasi Mitra minta.";
    case "berkas_kosong":
      return "Pilih berkas lebih dulu.";
    case "berkas_tidak_didukung":
      return `Berkas harus foto (JPG, PNG, WEBP) atau PDF, maksimal ${Math.round(DOKUMEN_MAX_BYTES / (1024 * 1024))} MB.`;
    case "penyimpanan_belum_tersedia":
      return "Penyimpanan belum tersedia. Bawa dokumennya langsung pada hari pemakaman.";
    default:
      return "Dokumen belum bisa diunggah.";
  }
}

export { JENIS_BERKAS };
