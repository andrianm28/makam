"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { pemesananResource } from "@/domain/identity";
import { periksaPilihanTerencanaSchema } from "@/domain/pemesanan";
import { pesanGuard, pesanKirim, pesanPeriksa } from "@/lib/terencana-pesan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import { draftSchema, type DraftTerencana, type KirimState } from "./draft";
import { terencanaPath } from "./tautan";

/*
 * The Terencana wizard's thin Server Actions (AGENTS.md), in order: authenticate,
 * check the role, validate with Zod, call the Pemesanan module.
 *
 * - `kirimPesananTerencana` is a signed-in action: the guard resolves the actor
 *   from the session cookie itself.
 * - `verifikasiKodeMasukDanKirimTerencana` is the login itself, so it skips the
 *   guard's first two steps the way Masuk does: the Kode Masuk proves the email
 *   and creates or finds the Akun, and the same request places the order for it.
 */

/**
 * "Lanjut", the wizard's own step between the Denah and Data & kirim: it asks the
 * Pemesanan module whether the chosen plots can still be ordered, and words a
 * refusal the same way Kirim does. No auth and no role: it changes nothing, it only
 * reads whether a plot is still free, which the public Denah already shows.
 */
export async function lanjutPilihPetak(input: unknown): Promise<LanjutState> {
  const parsed = periksaPilihanTerencanaSchema.safeParse(input);
  if (!parsed.success) return { status: "gagal", message: pesanPeriksa({ ok: false, reason: "tanpa_unit", nomor: null, sisa: [] }), sisa: [] };
  const hasil = await serverRuntime().pemesanan.periksaPilihanTerencana(parsed.data);
  return hasil.ok ? { status: "ok" } : { status: "gagal", message: pesanPeriksa(hasil), sisa: hasil.sisa };
}

export type LanjutState =
  | { status: "ok" }
  /** The plot is gone: the message says which, and `sisa` are the picks that are still good. */
  | { status: "gagal"; message: string; sisa: { jenis: "petak" | "kavling"; id: string; nomor: string; jenisMakamId: string; jenisMakamName: string }[] };

/** Kirim for a Pemesan already signed in; a visitor with no session is answered with "perlu_kode_masuk". */
export async function kirimPesananTerencana(draft: unknown): Promise<KirimState> {
  const hasil = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: draftSchema,
    input: draft,
    run: (actor, data) => kirim({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  return { status: "gagal", message: pesanGuard(hasil.error) };
}

/**
 * The Kode Masuk step at Kirim: a correct code creates or finds the Akun of that
 * email, signs it in and places the order in the same request, landing the family
 * on the confirmation with its plots held.
 */
export async function verifikasiKodeMasukDanKirimTerencana(
  draft: unknown,
  _state: KodeMasukVerifyState,
  formData: FormData,
): Promise<KodeMasukVerifyState> {
  const parsedDraft = draftSchema.safeParse(draft);
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
  redirect(terencanaPath({ langkah: "terkirim", lokasiId: parsedDraft.data.lokasiId, nomor: hasil.nomor }));
}

/** Places the order for one Pemesan, and words the outcome for the screen. */
async function kirim(
  pemesan: { accountId: string; email: string },
  draft: DraftTerencana,
): Promise<{ status: "selesai"; nomor: string } | { status: "gagal"; message: string }> {
  const hasil = await serverRuntime().pemesanan.placeTerencana({
    pemesan,
    pemesanName: draft.pemesanName,
    phoneNumber: draft.phoneNumber,
    lokasiId: draft.lokasiId,
    units: draft.units,
    pemegangHak: draft.pemegangHak.mode === "pemesan" ? { mode: "pemesan", name: draft.pemesanName } : draft.pemegangHak,
    calonPenghuni: draft.calonPenghuni,
    layanan: draft.layanan,
  });
  if (!hasil.ok) return { status: "gagal", message: pesanKirim(hasil) };
  return { status: "selesai", nomor: hasil.pemesanan.nomor };
}
