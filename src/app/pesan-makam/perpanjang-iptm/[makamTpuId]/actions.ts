"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

/** What the Perpanjangan IPTM screen sends: who orders, and the IPTM expiry date read off the IPTM photo. */
const pesanSchema = z.object({
  makamTpuId: z.uuid(),
  pemesanName: z.string().trim().min(1, "Tulis nama Anda."),
  phoneNumber: z.string().trim().min(1, "Tulis nomor telepon Anda."),
  berlakuSampai: z.iso.date("Tulis tanggal berakhir IPTM sesuai foto IPTM."),
});

const GAGAL: Record<string, string> = {
  input_tidak_valid: "Periksa lagi isian Anda.",
  email_bukan_akun_ini: "Email akun Anda tidak cocok dengan pesanan ini. Masuk ulang lalu coba lagi.",
  makam_tpu_tidak_ditemukan: "Makam ini tidak ada di akun Anda.",
  terlalu_awal: "Perpanjangan baru bisa dipesan mulai 3 bulan sebelum IPTM berakhir.",
  harga_tidak_tersedia: "Harga belum bisa ditampilkan saat ini. Hubungi CS.",
};

/**
 * Perpanjangan TPU (ticket 48): places the IPTM renewal of the signed-in Pemegang Hak's Makam TPU, from 3 months before its
 * expiry, and lands them on its order page, where the filing documents are uploaded. Nothing is billed until Admin
 * Platform has checked the documents.
 */
export async function pesanPerpanjanganTpuAction(formData: FormData): Promise<void> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const makamTpuId = text("makamTpuId");
  const kembali = `/pesan-makam/perpanjang-iptm/${encodeURIComponent(makamTpuId)}`;
  const hasil = await guarded({
    fitur: "tpu",
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: pesanSchema,
    input: { makamTpuId, pemesanName: text("pemesanName"), phoneNumber: text("phoneNumber"), berlakuSampai: text("berlakuSampai") },
    run: async (actor, data) =>
      serverRuntime().pengurusan.placePerpanjanganTpu({
        pemesan: { accountId: actor.accountId, email: actor.email ?? "" },
        pemesanName: data.pemesanName,
        phoneNumber: data.phoneNumber,
        makamTpuId: data.makamTpuId,
        berlakuSampai: data.berlakuSampai,
      }),
  });
  if (!hasil.ok) {
    if (hasil.error === "belum_masuk") redirect("/masuk");
    const pesan = hasil.error === "input_tidak_valid" ? (hasil.issues?.[0]?.message ?? "Periksa lagi isian Anda.") : "Anda tidak bisa memesan dari akun ini.";
    redirect(`${kembali}?galat=${encodeURIComponent(pesan)}`);
  }
  if (!hasil.value.ok) redirect(`${kembali}?galat=${encodeURIComponent(GAGAL[hasil.value.reason] ?? "Pesanan belum bisa dibuat.")}`);
  redirect(`/pengurusan/${hasil.value.pengurusan.nomor}`);
}
