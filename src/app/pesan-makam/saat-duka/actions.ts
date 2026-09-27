"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type IdentityRefusal } from "@/components/kode-masuk/state";
import { pemesananResource } from "@/domain/identity";
import { pemesananMessage } from "@/lib/pemesanan-labels";
import { guarded, GuardRejected } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import { draftSchema, KOTA_PILIHAN, pesananPath, type DraftSaatDuka, type KirimState } from "./draft";

/*
 * The wizard's three thin Server Actions (AGENTS.md), in this order:
 * authenticate, check the role, validate with Zod, call the Pemesanan module.
 *
 * - `kirimPesanan` is a signed-in action: the guard resolves the actor from the
 *   session cookie itself.
 * - `verifikasiKodeMasukDanKirim` is the login itself, so it skips the guard's
 *   first two steps the way Masuk does: the Kode Masuk proves the email and
 *   creates or finds the Akun, and the same request places the order for it.
 * - `ingatKota` remembers the city the visitor filtered by; it changes no
 *   domain data, only their own filter for the next visit.
 */

/**
 * Kirim for a Pemesan who is already signed in. A visitor with no session is
 * answered with "perlu_kode_masuk", which opens the Kode Masuk step under the
 * form instead of refusing silently: the wizard's login is that step.
 */
export async function kirimPesanan(draft: unknown): Promise<KirimState> {
  const hasil = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: draftSchema,
    input: draft,
    run: (actor, data) => kirim({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  return { status: "gagal", message: pemesananMessage(hasil.error) };
}

/**
 * The Kode Masuk step: a correct code creates or finds the Akun of that email,
 * logs it in, and places the order in the same request, landing the family on
 * the order page. A refusal says why, in identity's own words.
 */
export async function verifikasiKodeMasukDanKirim(draft: unknown, _state: KirimState, formData: FormData): Promise<KirimState> {
  const parsedDraft = draftSchema.safeParse(draft);
  if (!parsedDraft.success) return { status: "gagal", message: isianMessage(parsedDraft.error) };
  const parsedCode = z
    .object({ email: z.email(), code: z.string().regex(/^\d{6}$/, "Masukkan 6 angka Kode Masuk dari email Anda.") })
    .safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsedCode.success) return { status: "gagal", message: parsedCode.error.issues[0]?.message ?? "Masukkan Kode Masuk dari email Anda." };

  const { identity, adapters } = serverRuntime();
  const login = await identity.verifyKodeMasuk(parsedCode.data);
  if (!login.ok) return { status: "gagal", message: identityMessage(login.reason as IdentityRefusal, undefined, adapters.clock.now()) };
  await setSessionCookies(login.session.cookies);

  const hasil = await kirim({ accountId: login.account.id, email: login.account.email }, parsedDraft.data);
  if (hasil.status !== "selesai") return hasil;
  redirect(pesananPath(hasil.nomor));
}

const kotaSchema = z.object({
  kota: z.string().trim().max(120),
  // Only the wizard's own first screen may be returned to.
  kembali: z.string().trim().regex(/^\/pesan-makam\/saat-duka(\?|$)/),
});

/** Remembers the city the visitor filtered by, so the next visit starts there. */
export async function ingatKota(formData: FormData): Promise<void> {
  const parsed = kotaSchema.safeParse({ kota: formData.get("kota"), kembali: formData.get("kembali") });
  if (!parsed.success) throw new GuardRejected("input_tidak_valid");
  const { kota, kembali } = parsed.data;
  const store = await cookies();
  if (kota === "") store.delete(KOTA_PILIHAN);
  else store.set(KOTA_PILIHAN, kota, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const query = kota === "" ? "" : `${kembali.includes("?") ? "&" : "?"}kota=${encodeURIComponent(kota)}`;
  redirect(`${kembali}${query}`);
}

/** Places the order for one Pemesan, and words the outcome for the screen. */
async function kirim(pemesan: { accountId: string; email: string }, draft: DraftSaatDuka): Promise<KirimState> {
  const hasil = await serverRuntime().pemesanan.placeSaatDuka({
    pemesan,
    pemesanName: draft.pemesanName,
    phoneNumber: draft.phoneNumber,
    lokasiId: draft.lokasiId,
    jenisMakamId: draft.jenisMakamId,
    almarhumName: draft.almarhumName,
    tanggalWafat: draft.tanggalWafat,
    rencanaPemakamanAt: waktuRencana(draft.rencanaPemakamanAt),
    keinginanPenempatan: draft.keinginanPenempatan === "" ? null : draft.keinginanPenempatan,
    pemegangHak:
      draft.pemegangHak.mode === "pemesan"
        ? { mode: "pemesan" }
        : { mode: "lain", name: draft.pemegangHak.name, phoneNumber: draft.pemegangHak.phoneNumber, email: draft.pemegangHak.email },
  });
  if (!hasil.ok) return { status: "gagal", message: pemesananMessage(hasil.reason) };
  return { status: "selesai", nomor: hasil.pemesanan.nomor };
}

/** The planned burial time as a `datetime-local` input holds it, read as WIB; null when it was left empty. */
function waktuRencana(typed: string): Date | null {
  const [tanggal, jam = "00:00"] = typed.split("T");
  if (!tanggal || !jam) return null;
  const waktu = new Date(`${tanggal}T${jam}:00+07:00`);
  return Number.isNaN(waktu.getTime()) ? null : waktu;
}

/** The first thing wrong with the draft, in the words the field itself would use. */
function isianMessage(hasil: z.ZodError): string {
  return hasil.issues[0]?.message ?? "Periksa lagi isian Anda.";
}
