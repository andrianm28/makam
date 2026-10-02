"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { akunResource } from "@/domain/identity";
import { PETUNJUK_DIRUJUK } from "@/domain/wakaf/skema";
import { pesanWakaf } from "@/lib/wakaf-tampilan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import type { DraftWakaf, KirimWakafState } from "./draft";

/*
 * The Wakaf Tanah form's thin Server Actions (AGENTS.md).
 * - `ajukanWakafSaya` is a signed-in action: the guard resolves the actor from the session cookie itself;
 *   a visitor with no session is answered with "perlu_kode_masuk".
 * - `verifikasiKodeMasukDanAjukanWakaf` is the login itself, so it skips the guard's first two steps the
 *   way Masuk does: the Kode Masuk proves the email and creates or finds the Akun, and the same request
 *   files the Pengajuan for it.
 */

const draftSchema = z.object({
  tujuan: z.enum(["sosial", "keluarga"]),
  namaKeluarga: z.string().max(200),
  wakifNama: z.string().max(200),
  wakifTelepon: z.string().max(30),
  hubunganDenganTanah: z.string().max(200),
  kabKota: z.string().max(100),
  alamat: z.string().max(500),
  lat: z.string().max(20),
  lng: z.string().max(20),
  luasM2: z.string().max(20),
  jenisBukti: z.string().max(100),
  nazhirId: z.string().max(40),
  nazhirNama: z.string().max(200),
});

const PERIKSA = "Periksa lagi isian Anda.";

function angka(teks: string): number | null {
  const bersih = teks.trim().replace(",", ".");
  if (bersih === "") return null;
  const nilai = Number(bersih);
  return Number.isFinite(nilai) ? nilai : Number.NaN;
}

/** The draft as the Wakaf module's input; what does not parse stays as it is for the module's schema to refuse. */
function keInput(draft: z.infer<typeof draftSchema>): Record<string, unknown> {
  const lat = angka(draft.lat);
  const lng = angka(draft.lng);
  return {
    tujuan: draft.tujuan,
    namaKeluarga: draft.namaKeluarga.trim() || undefined,
    wakifNama: draft.wakifNama,
    wakifTelepon: draft.wakifTelepon,
    hubunganDenganTanah: draft.hubunganDenganTanah,
    kabKota: draft.kabKota,
    alamat: draft.alamat,
    pin: lat !== null && lng !== null ? { lat, lng } : null,
    luasM2: angka(draft.luasM2),
    jenisBukti: draft.jenisBukti,
    nazhirId: draft.nazhirId || null,
    nazhirNama: draft.nazhirNama.trim() || undefined,
  };
}

async function ajukan(wakif: { accountId: string; email: string }, draft: z.infer<typeof draftSchema>): Promise<Exclude<KirimWakafState, { status: "idle" | "perlu_kode_masuk" }>> {
  const hasil = await serverRuntime().wakaf.ajukanWakaf(wakif, keInput(draft));
  if (!hasil.ok) return { status: "gagal", message: pesanWakaf(hasil.reason) };
  if (hasil.status === "dirujuk") return { status: "dirujuk", nomor: hasil.nomor, petunjuk: PETUNJUK_DIRUJUK };
  return { status: "selesai", nomor: hasil.nomor };
}

/** Kirim for a Wakif already signed in. */
export async function ajukanWakafSaya(draft: DraftWakaf): Promise<KirimWakafState> {
  const hasil = await guarded({
    action: "akun.lihat",
    resource: (actor) => akunResource(actor.accountId),
    schema: draftSchema,
    input: draft,
    run: (actor, data) => ajukan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  if (hasil.error === "input_tidak_valid") return { status: "gagal", message: PERIKSA };
  return { status: "gagal", message: "Anda tidak dapat mengajukan wakaf dari akun ini." };
}

/** The Kode Masuk step at Kirim: a correct code signs the Akun in and files the Pengajuan in the same request. */
export async function verifikasiKodeMasukDanAjukanWakaf(
  draft: DraftWakaf,
  _state: KodeMasukVerifyState,
  formData: FormData,
): Promise<KodeMasukVerifyState> {
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
  redirect(`/wakaf-tanah?nomor=${encodeURIComponent(hasil.nomor)}`);
}
