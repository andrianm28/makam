"use server";

import { revalidatePath } from "next/cache";
import { pesananLayananResource } from "@/domain/identity";
import { ajukanKeluhanSchema, batalkanPekerjaanSchema, beriPenilaianSchema } from "@/domain/layanan/pesanan-schema";
import { kirimPesanSchema } from "@/domain/layanan/pesan-skema";
import { keluhanMessages, layananBatalMessages, penilaianMessages, pesanPekerjaanMessages } from "@/lib/layanan-labels";
import { guarded } from "@/server/guard";
import { lampiranDari } from "@/server/form-lampiran";
import { serverRuntime } from "@/server/runtime";
import type { KirimPesanState } from "@/components/makam/thread-pekerjaan";

/** What a Server Action's form state carries back to the screen (the design system's inline errors). */
export type BatalActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/**
 * The Pemesan cancels one job. Thin, in order: authenticate (the guard resolves
 * the actor from the session cookie), check the role, validate with Zod, call the
 * Layanan module — which is where the H-1 window, the "until it starts" window
 * and the refund amount are decided.
 */
export async function batalkanPekerjaanLayanan(_previous: BatalActionState, formData: FormData): Promise<BatalActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "layanan.lihat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: batalkanPekerjaanSchema,
    input: { pekerjaanId: formData.get("pekerjaanId"), alasan: formData.get("alasan") },
    run: (actor, data) =>
      serverRuntime().layanan.batalkanPekerjaan({ accountId: actor.accountId, email: actor.email }, {
        pekerjaanId: data.pekerjaanId,
        alasan: data.alasan,
      }),
  });
  if (!result.ok) return { status: "gagal", message: layananBatalMessages[result.error] ?? "Periksa lagi isian Anda." };
  revalidatePath(`/layanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: layananBatalMessages[result.value.reason] ?? "Periksa lagi isian Anda." };
  const pengembalian = result.value.pengembalian;
  return {
    status: "berhasil",
    message: pengembalian
      ? pengembalian.platformDikembalikan
        ? `Pekerjaan dibatalkan. Seluruh Tagihan ${formatJumlah(pengembalian.total)} kami kembalikan karena pekerjaan terlambat.`
        : `Pekerjaan dibatalkan. ${formatJumlah(pengembalian.total)} dikembalikan; biaya layanan platform tetap kami kenakan.`
      : "Pekerjaan dibatalkan.",
  };
}

/** Whole rupiah, in the words the order page says. */
function formatJumlah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

/** What a Keluhan or Penilaian form's state carries back to the screen. */
export type PemesanActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/**
 * The Pemesan files a Keluhan on one finished job. Thin, in order: authenticate, check the role,
 * validate with Zod, call the Layanan module — which decides whether the 3×24 h window is still open.
 */
export async function ajukanKeluhanLayanan(_previous: PemesanActionState, formData: FormData): Promise<PemesanActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "layanan.lihat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: ajukanKeluhanSchema,
    input: { pekerjaanId: formData.get("pekerjaanId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().layanan.ajukanKeluhan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: keluhanMessages[result.error] ?? "Periksa lagi isian Anda." };
  revalidatePath(`/layanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: keluhanMessages[result.value.reason] ?? "Periksa lagi isian Anda." };
  return { status: "berhasil", message: "Keluhan Anda sudah kami terima. Kami akan menghubungi Anda secepatnya." };
}

/** The Pemesan rates one finished job, 1 to 5 stars with an optional comment. */
export async function beriPenilaianLayanan(_previous: PemesanActionState, formData: FormData): Promise<PemesanActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "layanan.lihat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: beriPenilaianSchema,
    input: { pekerjaanId: formData.get("pekerjaanId"), bintang: formData.get("bintang"), komentar: formData.get("komentar") },
    run: (actor, data) => serverRuntime().layanan.beriPenilaian({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: penilaianMessages[result.error] ?? "Pilih 1 sampai 5 bintang." };
  revalidatePath(`/layanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: penilaianMessages[result.value.reason] ?? "Pilih 1 sampai 5 bintang." };
  return { status: "berhasil", message: "Terima kasih. Penilaian Anda sudah kami terima." };
}

/**
 * The Pemesan writes in the thread of one of their own jobs. Thin, in order: authenticate,
 * check the role, validate with Zod (its photos converted from the form), call the Layanan
 * module — which decides whether the Keluhan window has closed the thread and who may post.
 */
export async function kirimPesanLayanan(_previous: KirimPesanState, formData: FormData): Promise<KirimPesanState> {
  const nomor = String(formData.get("nomor") ?? "");
  const lampiran = await lampiranDari(formData);
  // A photo the form cannot carry is refused here, before any message is written,
  // so the screen never reports a success that quietly lost it.
  if (!lampiran.ok) return { status: "gagal", message: pesanPekerjaanMessages[lampiran.reason] ?? "Periksa lagi pesan Anda." };
  const result = await guarded({
    action: "layanan.lihat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: kirimPesanSchema,
    input: { pekerjaanId: formData.get("pekerjaanId"), teks: formData.get("teks"), lampiran: lampiran.lampiran },
    run: (actor, data) => serverRuntime().layanan.kirimPesanPekerjaan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: pesanPekerjaanMessages[result.error] ?? "Periksa lagi pesan Anda." };
  revalidatePath(`/layanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: pesanPekerjaanMessages[result.value.reason] ?? "Periksa lagi pesan Anda." };
  return { status: "berhasil", message: "Pesan Anda terkirim." };
}
