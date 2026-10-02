"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { pesananLayananResource } from "@/domain/identity";
import { placePesananLayananSchema } from "@/domain/layanan/pesanan-schema";
import { layananOrderMessages } from "@/lib/layanan-labels";
import { guarded, gerbangAksi } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";

/*
 * The Layanan order's thin Server Actions (AGENTS.md), in order: authenticate,
 * check the role, validate with Zod, call the Layanan module.
 *
 * - `kirimPesananLayanan` is a signed-in action: the guard resolves the actor
 *   from the session cookie itself.
 * - `verifikasiKodeMasukDanKirimLayanan` is the login itself, so it skips the
 *   guard's first two steps the way Masuk and the booking wizards do: the Kode
 *   Masuk proves the email and creates or finds the Akun, and the same request
 *   places the order for it.
 */

/** What a Kirim answers: placed, waiting for the Kode Masuk that proves the email, or refused in words. */
export type KirimLayananState =
  | { status: "idle" }
  | { status: "perlu_kode_masuk" }
  | { status: "selesai"; nomor: string }
  | { status: "gagal"; message: string };

/**
 * The running all-in price of the chosen set, recomputed on every change so the
 * screen and the Tagihan are one number. No auth and no role: it changes
 * nothing, and the price it shows is the public one.
 */
export async function hargaPilihanLayanan(input: unknown): Promise<{ total: number; platformFee: number; parts: { label: string; amount: number }[] } | null> {
  // Rilis 1 (ADR 0006): said explicitly, so the guard test sees every action has a release.
  gerbangAksi("inti");
  // The form's own state carries `inForceSince` too, which this read does not need to recompute.
  const parsed = z.object({ lokasiId: z.uuid(), layananVariantIds: z.array(z.uuid()).max(10) }).safeParse(input);
  if (!parsed.success || parsed.data.layananVariantIds.length === 0) return null;
  const hasil = await serverRuntime().layanan.hargaPesananLayanan(parsed.data.lokasiId, parsed.data.layananVariantIds);
  return hasil ? { total: hasil.total, platformFee: hasil.platformFee, parts: hasil.parts.map((baris) => ({ label: baris.label, amount: baris.amount })) } : null;
}

/** Kirim for a Pemesan already signed in; a visitor with no session is answered with "perlu_kode_masuk". */
export async function kirimPesananLayanan(draft: unknown): Promise<KirimLayananState> {
  const hasil = await guarded({
    fitur: "inti",
    action: "layanan.buat",
    resource: (actor) => pesananLayananResource(actor.accountId),
    schema: placePesananLayananSchema,
    input: draft,
    run: (actor, data) => kirim({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  return { status: "gagal", message: layananOrderMessages[hasil.error as keyof typeof layananOrderMessages] ?? layananOrderMessages.input_tidak_valid };
}

/**
 * The Kode Masuk step at Kirim: a correct code creates or finds the Akun of that
 * email, signs it in and places the order in the same request, landing the family
 * on the order with its Tagihan to pay.
 */
export async function verifikasiKodeMasukDanKirimLayanan(
  draft: unknown,
  _state: KodeMasukVerifyState,
  formData: FormData,
): Promise<KodeMasukVerifyState> {
  // Rilis 1 (ADR 0006): said explicitly, so the guard test sees every action has a release.
  gerbangAksi("inti");
  const parsedDraft = placePesananLayananSchema.safeParse(draft);
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
  draft: unknown,
): Promise<{ status: "selesai"; nomor: string } | { status: "gagal"; message: string }> {
  const hasil = await serverRuntime().layanan.placePesananLayanan(pemesan, draft);
  if (!hasil.ok) {
    const message = layananOrderMessages[hasil.reason as keyof typeof layananOrderMessages] ?? layananOrderMessages.input_tidak_valid;
    return { status: "gagal", message };
  }
  return { status: "selesai", nomor: hasil.pesanan.nomor };
}
