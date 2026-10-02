"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { pesananLayananResource } from "@/domain/identity";
import { bytesOf } from "@/lib/files/base64";
import { layananTpuOrderMessages } from "@/lib/layanan-tpu-labels";
import { gerbangAksi, guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import { draftTpuSchema } from "./draft";

/*
 * The TPU Layanan order's thin Server Actions (AGENTS.md), in order: authenticate,
 * check the role, validate with Zod, call the Layanan module.
 *
 * - `kirimPesananLayananTpu` is a signed-in action: the guard resolves the actor from
 *   the session cookie itself.
 * - `verifikasiKodeMasukDanKirimLayananTpu` is the login itself, so it skips the
 *   guard's first two steps the way Masuk and the booking wizards do: the Kode Masuk
 *   proves the email and creates or finds the Akun, and the same request places the
 *   order for it.
 */

/** What a Kirim answers: placed, waiting for the Kode Masuk that proves the email, or refused in words. */
export type KirimLayananTpuState =
  | { status: "idle" }
  | { status: "perlu_kode_masuk" }
  | { status: "selesai"; nomor: string }
  | { status: "gagal"; message: string };

/** Kirim for a Pemesan already signed in; a visitor with no session is answered with "perlu_kode_masuk". */
export async function kirimPesananLayananTpu(draft: unknown): Promise<KirimLayananTpuState> {
  const hasil = await guarded({
    fitur: "tpu",
    action: "layanan.buat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: draftTpuSchema,
    input: draft,
    run: (actor, data) => kirim({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  return { status: "gagal", message: layananTpuOrderMessages[hasil.error] };
}

/**
 * The Kode Masuk step at Kirim: a correct code creates or finds the Akun of that
 * email, signs it in and places the order in the same request, landing the family on
 * the order with its Tagihan to pay.
 */
export async function verifikasiKodeMasukDanKirimLayananTpu(
  draft: unknown,
  _state: KodeMasukVerifyState,
  formData: FormData,
): Promise<KodeMasukVerifyState> {
  gerbangAksi("tpu");
  const parsedDraft = draftTpuSchema.safeParse(draft);
  if (!parsedDraft.success) return { status: "gagal", message: parsedDraft.error.issues[0]?.message ?? "Periksa lagi isian Anda." };
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

  const hasil = await kirim({ accountId: login.account.id, email: login.account.email }, parsedDraft.data);
  if (hasil.status !== "selesai") return { status: "gagal", message: hasil.message };
  redirect(`/layanan/${hasil.nomor}`);
}

/** Places the order for one Pemesan, and words the outcome for the screen. */
async function kirim(
  pemesan: { accountId: string; email: string },
  data: z.output<typeof draftTpuSchema>,
): Promise<{ status: "selesai"; nomor: string } | { status: "gagal"; message: string }> {
  const { foto, ...pesanan } = data;
  const hasil = await serverRuntime().layanan.placePesananLayananTpu(
    pemesan,
    pesanan,
    foto ? { body: bytesOf(foto.isi), contentType: foto.contentType } : null,
  );
  if (!hasil.ok) return { status: "gagal", message: layananTpuOrderMessages[hasil.reason] };
  return { status: "selesai", nomor: hasil.pesanan.nomor };
}
