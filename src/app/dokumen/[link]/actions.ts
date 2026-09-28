"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { documentLinkSchema } from "@/domain/billing";
import { rekeningSchema } from "@/domain/refunds";
import { documentPagePath } from "@/lib/document-links";
import { serverRuntime } from "@/server/runtime";

/** What the bank-account form's Server Action hands back to it. */
export type RekeningFormState = { status: "idle" } | { status: "berhasil" | "gagal"; message: string };

/*
 * Bayar is open to anyone holding a Tagihan's link: the unguessable link is
 * the capability, and anyone may pay a Tagihan (spec, Billing). So, like
 * Masuk, this action skips the guard's authenticate and role steps; it
 * validates with Zod and calls Billing, which decides what may be paid.
 *
 * `isiRekeningPengembalian` below is the same shape for a sibling reason
 * (ticket 31, AGENTS.md's Bayar exception): the Tagihan's own link is already
 * the family's proof that a refund on it is theirs, so entering its
 * destination bank account skips the guard's authenticate and role steps too,
 * and still validates every field with Zod and calls Refunds, which decides
 * whether there is a request open to receive it.
 */

const bayarSchema = z.object({ link: documentLinkSchema });

/** Bayar: on to the PaymentProvider's payment page for the Tagihan (its Bukti Pembayaran once Lunas). */
export async function bayarTagihan(formData: FormData): Promise<void> {
  const parsed = bayarSchema.safeParse({ link: formData.get("link") });
  if (!parsed.success) notFound();
  const result = await serverRuntime().billing.bayar(parsed.data.link);
  if (result.ok) redirect(result.paymentUrl);
  if (result.reason === "sudah_lunas") redirect(documentPagePath(result.buktiLink));
  if (result.reason === "tidak_ditemukan") notFound();
  // Dibatalkan: the Tagihan's own page says why it can no longer be paid.
  redirect(documentPagePath(parsed.data.link));
}

const isiRekeningSchema = z.object({
  link: documentLinkSchema,
  bank: z.string(),
  nomor: z.string(),
  nama: z.string(),
});

const GAGAL: Record<string, string> = {
  tidak_ditemukan: "Tidak ada permintaan pengembalian dana yang menunggu rekening untuk Tagihan ini.",
  sudah_ditransfer: "Pengembalian dana untuk Tagihan ini sudah ditransfer.",
  input_tidak_valid: "Periksa lagi isian rekening Anda.",
};

/**
 * The Pemesan enters the refund's destination bank account, on the Tagihan's
 * own unguessable link (ticket 31, AC 5). Not `guarded()`: the link is the
 * permission, exactly like Bayar.
 */
export async function isiRekeningPengembalian(_previous: RekeningFormState, formData: FormData): Promise<RekeningFormState> {
  const parsed = isiRekeningSchema.safeParse({
    link: formData.get("link"),
    bank: formData.get("bank"),
    nomor: formData.get("nomor"),
    nama: formData.get("nama"),
  });
  if (!parsed.success) return { status: "gagal", message: "Periksa lagi isian rekening Anda." };
  const runtime = serverRuntime();
  const document = await runtime.billing.documentByLink(parsed.data.link);
  if (!document || document.type !== "tagihan") return { status: "gagal", message: "Tagihan tidak ditemukan." };
  const rekening = rekeningSchema.safeParse({ bank: parsed.data.bank, nomor: parsed.data.nomor, nama: parsed.data.nama });
  if (!rekening.success) return { status: "gagal", message: "Periksa lagi isian rekening Anda." };
  const result = await runtime.refunds.isiRekeningPemesan({ tagihanId: document.tagihan.id, rekening: rekening.data });
  if (!result.ok) return { status: "gagal", message: GAGAL[result.reason] ?? "Rekening gagal disimpan." };
  return { status: "berhasil", message: "Rekening tersimpan. Kami akan mentransfer pengembalian dana ke rekening ini." };
}
