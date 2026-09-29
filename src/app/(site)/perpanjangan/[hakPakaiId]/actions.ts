"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { identityMessage } from "@/components/kode-masuk/state";
import { pemesananResource } from "@/domain/identity";
import { documentPagePath } from "@/lib/document-links";
import { alasanPerpanjanganText } from "@/lib/perpanjangan-labels";
import { clientIp } from "@/server/client-ip";
import { codeInput } from "@/server/code-inputs";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";

/*
 * The Perpanjangan page's Server Actions, each thin (AGENTS.md): validate with
 * Zod, then call the Perpanjangan module.
 *
 * - `pesanPerpanjangan` is a signed-in action: the guard resolves the actor from
 *   the session cookie itself, and the module checks that the Akun's Email
 *   Terverifikasi is the one recorded on the Hak Pakai.
 * - `kirimKodePerpanjangan` and `verifikasiKodePerpanjangan` are the code step: the
 *   login itself, so like Masuk they skip the guard's first two steps, validate with
 *   Zod and call the module (which calls identity). The recorded email is never asked
 *   for and never shown; only the module knows it. Neither orders anything: the order
 *   is `pesanPerpanjangan`, guarded like every other signed-in action.
 */

const hakPakaiSchema = z.object({ hakPakaiId: z.uuid() });
const termsSchema = z.coerce.number().int().min(1).max(100);
const pesanSchema = hakPakaiSchema.extend({ terms: termsSchema });
const masukSchema = hakPakaiSchema.extend({ code: codeInput });

/** The page of one Hak Pakai's Perpanjangan, optionally with a message the last step ended with. */
function halaman(hakPakaiId: string, query: Record<string, string> = {}): string {
  const suffix = new URLSearchParams(query).toString();
  return `/perpanjangan/${hakPakaiId}${suffix === "" ? "" : `?${suffix}`}`;
}

/** Sends the code to the email recorded on the Hak Pakai, then back to the page that asks for it. */
export async function kirimKodePerpanjangan(formData: FormData): Promise<void> {
  const parsed = hakPakaiSchema.safeParse({ hakPakaiId: formData.get("hakPakaiId") });
  if (!parsed.success) redirect("/makam-keluarga");
  const { hakPakaiId } = parsed.data;
  const { perpanjangan, adapters } = serverRuntime();
  const hasil = await perpanjangan.kirimKode({ hakPakaiId, ip: await clientIp() });
  if (hasil.ok) redirect(halaman(hakPakaiId, { kode: "terkirim" }));
  if (hasil.reason === "tanpa_email") redirect(halaman(hakPakaiId, { galat: alasanPerpanjanganText("tanpa_email") }));
  redirect(halaman(hakPakaiId, { galat: identityMessage(hasil.reason, "retryAt" in hasil ? hasil.retryAt : undefined, adapters.clock.now()) }));
}

/**
 * The code step: a correct code is the login itself (identity finds or creates the Akun of the
 * recorded email and starts its session), and lands back on the page, where the signed-in holder
 * chooses the terms and orders through `pesanPerpanjangan`. Nothing is ordered here.
 */
export async function verifikasiKodePerpanjangan(formData: FormData): Promise<void> {
  const parsed = masukSchema.safeParse({ hakPakaiId: formData.get("hakPakaiId"), code: formData.get("code") });
  if (!parsed.success) {
    const id = hakPakaiSchema.safeParse({ hakPakaiId: formData.get("hakPakaiId") });
    if (!id.success) redirect("/makam-keluarga");
    redirect(halaman(id.data.hakPakaiId, { kode: "terkirim", galat: "Masukkan 6 angka kode dari email Anda." }));
  }
  const { hakPakaiId, code } = parsed.data;
  const { perpanjangan, adapters } = serverRuntime();
  const masuk = await perpanjangan.verifikasiKode({ hakPakaiId, code });
  if (!masuk.ok) {
    const pesan =
      masuk.reason === "tanpa_email"
        ? alasanPerpanjanganText("tanpa_email")
        : identityMessage(masuk.reason, "retryAt" in masuk ? masuk.retryAt : undefined, adapters.clock.now());
    redirect(halaman(hakPakaiId, { kode: "terkirim", galat: pesan }));
  }
  await setSessionCookies(masuk.session.cookies);
  redirect(halaman(hakPakaiId));
}

/** Orders the Perpanjangan for the signed-in Akun, landing on its Tagihan. */
export async function pesanPerpanjangan(formData: FormData): Promise<void> {
  const input = { hakPakaiId: formData.get("hakPakaiId"), terms: formData.get("terms") };
  const dijaga = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: pesanSchema,
    input,
    run: (actor, data) => serverRuntime().perpanjangan.ajukan({ hakPakaiId: data.hakPakaiId, terms: data.terms, pemohon: { accountId: actor.accountId, email: actor.email } }),
  });
  const id = hakPakaiSchema.safeParse({ hakPakaiId: input.hakPakaiId });
  if (!id.success) redirect("/makam-keluarga");
  const { hakPakaiId } = id.data;
  if (!dijaga.ok) {
    if (dijaga.error === "belum_masuk") redirect(halaman(hakPakaiId));
    redirect(halaman(hakPakaiId, { galat: dijaga.error === "input_tidak_valid" ? alasanPerpanjanganText("input_tidak_valid") : identityMessage(dijaga.error) }));
  }
  const hasil = dijaga.value;
  if (hasil.ok) redirect(documentPagePath(hasil.perpanjangan.tagihan.link));
  if (hasil.reason === "tagihan_terbuka") redirect(documentPagePath(hasil.tagihanTerbuka.link));
  redirect(halaman(hakPakaiId, { galat: alasanPerpanjanganText(hasil.reason) }));
}
