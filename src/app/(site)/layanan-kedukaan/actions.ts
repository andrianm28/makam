"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { akunResource } from "@/domain/identity";
import { jenisKedukaanValues, type JenisKedukaan } from "@/domain/kedukaan/skema";
import { hrefKedukaan } from "@/lib/kedukaan-konten";
import { gerbangAksi, guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import type { DraftKedukaan, KirimKedukaanState } from "./draft";

/*
 * The Permintaan Kedukaan form's thin Server Actions (AGENTS.md; mirrors Wakaf Tanah).
 * - `ajukanKedukaanSaya` is a signed-in action: the guard resolves the actor from the session cookie itself;
 *   a visitor with no session is answered with "perlu_kode_masuk".
 * - `verifikasiKodeMasukDanAjukanKedukaan` is the login itself (the Masuk exception): the Kode Masuk proves
 *   the email and the same request files the Permintaan for that Akun.
 */

const teks = (max: number) => z.string().max(max);
const draftSchema = z.object({
  jenis: z.enum(jenisKedukaanValues),
  nama: teks(200),
  telepon: teks(30),
  kabKota: teks(120),
  catatan: teks(1000),
  asal: teks(200),
  tujuan: teks(200),
  negaraAsal: teks(200),
  tanggal: teks(20),
  teksUcapan: teks(200),
  waktuDihubungi: teks(10),
  lokasiDiminati: teks(200),
});

const PERIKSA = "Periksa lagi isian Anda: semua kolom bertanda wajib perlu diisi.";
const PESAN: Record<string, string> = {
  input_tidak_valid: PERIKSA,
  nomor_telepon_tidak_valid: "Nomor telepon tidak valid. Tulis nomor Indonesia, misalnya 0812 3456 7890.",
};

/** The draft as the Kedukaan module's input: only the fields its jenis asks for. */
function keInput(draft: z.infer<typeof draftSchema>): Record<string, unknown> {
  const umum = { jenis: draft.jenis, nama: draft.nama, telepon: draft.telepon, kabKota: draft.kabKota, catatan: draft.catatan };
  const rincian: Record<JenisKedukaan, Record<string, unknown>> = {
    mobil_jenazah: { asal: draft.asal, tujuan: draft.tujuan, tanggal: draft.tanggal },
    cargo_jenazah: { asal: draft.asal, tujuan: draft.tujuan, tanggal: draft.tanggal },
    repatriasi_jenazah: { negaraAsal: draft.negaraAsal, tujuan: draft.tujuan, tanggal: draft.tanggal },
    rumah_duka: { tanggal: draft.tanggal },
    peti_jenazah: { tanggal: draft.tanggal },
    bunga_duka_cita: { tanggal: draft.tanggal, teksUcapan: draft.teksUcapan },
    konsultasi: { waktuDihubungi: draft.waktuDihubungi, lokasiDiminati: draft.lokasiDiminati },
  };
  return { ...umum, rincian: rincian[draft.jenis] };
}

async function ajukan(peminta: { accountId: string; email: string }, draft: z.infer<typeof draftSchema>): Promise<Exclude<KirimKedukaanState, { status: "idle" | "perlu_kode_masuk" }>> {
  const hasil = await serverRuntime().kedukaan.ajukan(peminta, keInput(draft));
  if (!hasil.ok) return { status: "gagal", message: PESAN[hasil.reason] ?? PERIKSA };
  return { status: "selesai", nomor: hasil.nomor };
}

/** Kirim for a family member already signed in. */
export async function ajukanKedukaanSaya(draft: DraftKedukaan): Promise<KirimKedukaanState> {
  const hasil = await guarded({
    fitur: "inti",
    action: "akun.lihat",
    resource: (actor) => akunResource(actor.accountId),
    schema: draftSchema,
    input: draft,
    run: (actor, data) => ajukan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  if (hasil.error === "input_tidak_valid") return { status: "gagal", message: PERIKSA };
  return { status: "gagal", message: "Permintaan tidak dapat dikirim dari akun ini." };
}

/** The Kode Masuk step at Kirim: a correct code signs the Akun in and files the Permintaan in the same request. */
export async function verifikasiKodeMasukDanAjukanKedukaan(
  draft: DraftKedukaan,
  _state: KodeMasukVerifyState,
  formData: FormData,
): Promise<KodeMasukVerifyState> {
  gerbangAksi("inti");
  const parsedDraft = draftSchema.safeParse(draft);
  if (!parsedDraft.success) return { status: "gagal", message: PERIKSA };
  const parsedCode = z
    .object({ email: z.email(), code: z.string().regex(/^\d{6}$/, "Masukkan 6 angka Kode Masuk dari email Anda.") })
    .safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsedCode.success) return { status: "gagal", message: parsedCode.error.issues[0]?.message ?? "Masukkan Kode Masuk dari email Anda." };

  const { identity, adapters } = serverRuntime();
  const login = await identity.verifyKodeMasuk(parsedCode.data);
  if (!login.ok) {
    const retryAt = "retryAt" in login ? login.retryAt : undefined;
    return { status: "gagal", message: identityMessage(login.reason, retryAt, adapters.clock.now()) };
  }
  await setSessionCookies(login.session.cookies);
  const hasil = await ajukan({ accountId: login.account.id, email: login.account.email }, parsedDraft.data);
  if (hasil.status === "gagal") return { status: "gagal", message: hasil.message };
  redirect(`${hrefKedukaan(parsedDraft.data.jenis)}?nomor=${encodeURIComponent(hasil.nomor)}`);
}
