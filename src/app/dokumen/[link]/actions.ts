"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { documentLinkSchema } from "@/domain/billing";
import { documentPagePath } from "@/lib/document-links";
import { serverRuntime } from "@/server/runtime";

/*
 * Bayar is open to anyone holding a Tagihan's link: the unguessable link is
 * the capability, and anyone may pay a Tagihan (spec, Billing). So, like
 * Masuk, this action skips the guard's authenticate and role steps; it
 * validates with Zod and calls Billing, which decides what may be paid.
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
  // The provider failed: back to the Tagihan's page, where the payer may retry.
  if (result.reason === "penyedia_gagal") redirect(`${documentPagePath(parsed.data.link)}?bayar=gagal`);
  // Dibatalkan: the Tagihan's own page says why it can no longer be paid.
  redirect(documentPagePath(parsed.data.link));
}
