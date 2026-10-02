"use server";

import { revalidatePath } from "next/cache";
import { pesananLayananResource } from "@/domain/identity";
import { ajukanKeluhanSchema, batalkanPekerjaanSchema, beriPenilaianSchema } from "@/domain/layanan/pesanan-schema";
import { ajukanKeluhanTpuSchema } from "@/domain/layanan/tpu-skema";
import { keluhanMessages, layananBatalMessages, penilaianMessages } from "@/lib/layanan-labels";
import { keluhanTpuMessages } from "@/lib/layanan-tpu-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

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
 * The Pemesan files a Keluhan on one finished TPU job (ticket 57). Thin, in order: authenticate, check the role,
 * validate with Zod, call the Layanan module, which decides whether the 3×24 h window since the approved proof is still open.
 */
export async function ajukanKeluhanPekerjaanTpu(_previous: PemesanActionState, formData: FormData): Promise<PemesanActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "layanan.lihat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: ajukanKeluhanTpuSchema,
    input: { pekerjaanId: formData.get("pekerjaanId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().layanan.ajukanKeluhanTpu({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: keluhanTpuMessages[result.error] ?? "Periksa lagi isian Anda." };
  revalidatePath(`/layanan/${nomor}`);
  // A hari-H item of a Saat Duka order is read on the Pengurusan page too.
  revalidatePath(`/pengurusan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: keluhanTpuMessages[result.value.reason] ?? "Periksa lagi isian Anda." };
  return { status: "berhasil", message: "Keluhan Anda sudah kami terima. Kami akan menghubungi Anda secepatnya." };
}
