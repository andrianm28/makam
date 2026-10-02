"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage, type IdentityRefusal } from "@/components/kode-masuk/state";
import { pemesananResource } from "@/domain/identity";
import { tumpangMessage } from "@/lib/tumpang-labels";
import { codeInput, emailInput } from "@/server/code-inputs";
import { gerbangAksi, guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import { masalahDariIssues, type KirimState } from "../saat-duka/draft";
import { draftTumpangSchema, type DraftTumpang } from "./draft";

/*
 * "Makamkan di sini" Kirim (AGENTS.md: authenticate, check the role, validate with Zod, call the Pemesanan module).
 * `ajukanTumpangAction` is the signed-in action; `verifikasiKodeMasukDanAjukanTumpang` is the login itself (the Kode
 * Masuk at Kirim, like the other wizards), so it skips the first two steps and still validates and calls the module.
 */

const pesananPath = (nomor: string) => `/pesanan/${encodeURIComponent(nomor)}`;

/** Kirim for a Pemesan already signed in; a visitor with no session opens the Kode Masuk step. */
export async function ajukanTumpangAction(draft: unknown): Promise<KirimState> {
  const hasil = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: draftTumpangSchema,
    input: draft,
    run: (actor, data) => ajukan({ accountId: actor.accountId, email: data.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  if (hasil.error === "input_tidak_valid") {
    const pesan = masalahDariIssues(hasil.issues ?? []);
    return { status: "gagal", pesan, message: Object.values(pesan)[0] ?? "Periksa lagi isian Anda." };
  }
  return { status: "gagal", message: "Anda tidak berwenang memesan." };
}

const kodeMasukSchema = z.object({ email: emailInput, code: codeInput });

/** The Kode Masuk step: a correct code finds or creates the Akun, logs it in and places the order in the same request. */
export async function verifikasiKodeMasukDanAjukanTumpang(draft: unknown, _state: KirimState, formData: FormData): Promise<KirimState> {
  // The login itself skips the guard, but the release gate still applies (ADR 0006).
  gerbangAksi("perpanjangan_lanjutan");
  const parsedDraft = draftTumpangSchema.safeParse(draft);
  if (!parsedDraft.success) {
    const pesan = masalahDariIssues(parsedDraft.error.issues);
    return { status: "gagal", pesan, message: Object.values(pesan)[0] ?? "Periksa lagi isian Anda." };
  }
  const parsedCode = kodeMasukSchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsedCode.success) return { status: "gagal", message: "Masukkan 6 angka Kode Masuk dari email Anda." };

  const { identity, adapters } = serverRuntime();
  const login = await identity.verifyKodeMasuk({ ...parsedCode.data, name: parsedDraft.data.pemesanName });
  if (!login.ok) return { status: "gagal", message: identityMessage(login.reason as IdentityRefusal, undefined, adapters.clock.now()) };
  await setSessionCookies(login.session.cookies);

  const hasil = await ajukan({ accountId: login.account.id, email: login.account.email }, parsedDraft.data);
  if (hasil.status !== "selesai") return hasil;
  redirect(pesananPath(hasil.nomor));
}

/** Places the request for one Pemesan and words the outcome for the screen. */
async function ajukan(pemesan: { accountId: string; email: string }, draft: DraftTumpang): Promise<KirimState> {
  const hasil = await serverRuntime().pemesanan.ajukanTumpang({
    pemesanAccountId: pemesan.accountId,
    pemesanEmail: draft.email,
    pemesanName: draft.pemesanName,
    phoneNumber: draft.phoneNumber,
    lokasiId: draft.lokasiId,
    hakPakaiId: draft.hakPakaiId,
    petakId: draft.petakId,
    jenis: draft.jenis,
    almarhumName: draft.almarhumName,
    tanggalWafat: draft.tanggalWafat,
    rencanaPemakamanAt: draft.rencanaPemakamanAt,
  });
  if (!hasil.ok) return { status: "gagal", message: tumpangMessage(hasil.reason) };
  return { status: "selesai", nomor: hasil.pesanan.nomor };
}
