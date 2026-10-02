"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import { jenisPenguburanSchema } from "@/domain/pengurusan";
import { berkasDari } from "@/server/form-fields";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

/** What the filing-only order screen sends: the facts of the burial, with the Pemegang Hak for the IPTM. */
const pesanSchema = z.object({
  tpuId: z.string().trim().min(1),
  pemesanName: z.string().trim().min(1, "Tulis nama Anda."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Anda."),
  almarhumName: z.string().trim().min(1, "Tulis nama almarhum."),
  tanggalWafat: z.iso.date(),
  jenis: jenisPenguburanSchema,
  ktpDki: z.boolean(),
  wafatDiJakarta: z.boolean(),
  blokNomor: z.string().trim(),
  namaKuburan: z.string().trim(),
  fotoIptm: z.object({ body: z.instanceof(Uint8Array), contentType: z.string() }).optional(),
  pemegangHak: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pemesan") }),
    z.object({ mode: z.literal("lain"), name: z.string().trim().min(1), phoneNumber: z.string().trim().min(1), email: z.string().trim() }),
  ]),
});

const GAGAL: Record<string, string> = {
  email_bukan_akun_ini: "Email akun Anda tidak cocok dengan pesanan ini. Masuk ulang lalu coba lagi.",
  tpu_tidak_ada: "TPU tidak ditemukan.",
  kelayakan_tidak_terpenuhi: "Tanpa KTP DKI dan tanpa kematian di Jakarta, TPU DKI tidak bisa kami urus. Hubungi CS untuk pilihan lain.",
  kuburan_kosong: "Untuk tumpang, tulis blok/nomor makam dan nama almarhum yang sudah dimakamkan di sana.",
  foto_iptm_kosong: "Untuk tumpang, unggah foto IPTM makam tersebut.",
  foto_iptm_terlalu_besar: "Foto IPTM terlalu besar (paling besar 4 MB).",
  berkas_tidak_didukung: "Foto IPTM harus JPG, PNG, WebP atau PDF.",
  berkas_gagal_disimpan: "Foto IPTM gagal disimpan. Coba lagi.",
  harga_tidak_tersedia: "Harga belum bisa ditampilkan saat ini. Hubungi CS.",
  pemesan_kosong: "Tulis nama Anda.",
  almarhum_kosong: "Tulis nama almarhum.",
  pemegang_hak_almarhum: "Pemegang Hak tidak boleh almarhum sendiri.",
};

/**
 * "Sudah dimakamkan? Kami urus IPTM-nya" (ticket 47): places a filing-only Pengurusan IPTM for the signed-in Pemesan
 * and lands them on its order page, where the filing documents are uploaded. Signed-in only here; the order is
 * Dimakamkan from the start and nothing is billed until Admin Platform has checked the documents.
 */
export async function pesanPengurusanIptmAction(formData: FormData): Promise<void> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const lain = text("pemegangHakMode") === "lain";
  const hasil = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: pesanSchema,
    input: {
      tpuId: text("tpuId"),
      pemesanName: text("pemesanName"),
      phoneNumber: text("phoneNumber"),
      almarhumName: text("almarhumName"),
      tanggalWafat: text("tanggalWafat"),
      jenis: text("jenis"),
      ktpDki: formData.get("ktpDki") === "on",
      wafatDiJakarta: formData.get("wafatDiJakarta") === "on",
      blokNomor: text("blokNomor"),
      namaKuburan: text("namaKuburan"),
      fotoIptm: await berkasDari(formData, "fotoIptm"),
      pemegangHak: lain
        ? { mode: "lain", name: text("pemegangHakName"), phoneNumber: text("pemegangHakPhone"), email: text("pemegangHakEmail") }
        : { mode: "pemesan" },
    },
    run: async (actor, data) =>
      serverRuntime().pengurusan.placePengurusanIptm({
        pemesan: { accountId: actor.accountId, email: actor.email ?? "" },
        pemesanName: data.pemesanName,
        phoneNumber: data.phoneNumber,
        tpuId: data.tpuId,
        almarhumName: data.almarhumName,
        tanggalWafat: data.tanggalWafat,
        jenis: data.jenis,
        kelayakan: { ktpDki: data.ktpDki, wafatDiJakarta: data.wafatDiJakarta },
        kuburan: data.jenis === "tumpang" ? { blokNomor: data.blokNomor, nama: data.namaKuburan } : null,
        fotoIptm: data.jenis === "tumpang" ? (data.fotoIptm ?? null) : null,
        pemegangHak: data.pemegangHak,
      }),
  });
  if (!hasil.ok) {
    if (hasil.error === "belum_masuk") redirect("/masuk");
    const pesan = hasil.error === "input_tidak_valid" ? (hasil.issues?.[0]?.message ?? "Periksa lagi isian Anda.") : "Anda tidak bisa memesan dari akun ini.";
    redirect(`/pesan-makam/pengurusan-iptm?galat=${encodeURIComponent(pesan)}`);
  }
  if (!hasil.value.ok) {
    redirect(`/pesan-makam/pengurusan-iptm?galat=${encodeURIComponent(GAGAL[hasil.value.reason] ?? "Pesanan belum bisa dibuat.")}`);
  }
  redirect(`/pengurusan/${hasil.value.pengurusan.nomor}`);
}
