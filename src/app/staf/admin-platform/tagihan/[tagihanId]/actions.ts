"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pencairanResource, tagihanResource } from "@/domain/identity";
import { formatRupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";
import { batalkanMessage, hargaKhususMessage, pembayaranManualMessage } from "./tagihan-messages";

/** The proof, as the form's file input hands it over (matches `setor-retribusi`'s own action). */
async function buktiFromForm(formData: FormData) {
  const file = formData.get("bukti");
  if (!(file instanceof File) || file.size === 0) return null;
  return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

const manualSchema = z.object({
  tagihanId: z.uuid(),
  metode: z.enum(["transfer_manual", "tunai"]),
  reference: z.string().trim().max(200).optional(),
  dibayarPada: z.string().trim().optional(),
  bukti: z.object({ body: z.instanceof(Uint8Array), contentType: z.string() }),
});

/**
 * Admin Platform records a Tagihan paid by hand (Transfer manual or Tunai) with
 * its proof (spec, Billing > Payment; ticket 30's AC 1): the Tagihan becomes
 * Lunas with one Bukti Pembayaran, and the downstream effects (the family's
 * receipt among them) fire in the same transaction.
 */
export async function catatPembayaranManualAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagihanId = String(formData.get("tagihanId") ?? "");
  const bukti = await buktiFromForm(formData);
  const result = await guarded({
    action: "tagihan.catat_pembayaran_manual",
    resource: () => tagihanResource(),
    schema: manualSchema,
    input: {
      tagihanId: formData.get("tagihanId"),
      metode: formData.get("metode"),
      reference: formData.get("reference") || undefined,
      dibayarPada: formData.get("dibayarPada") || undefined,
      bukti,
    },
    run: (actor, data) =>
      serverRuntime().billing.catatPembayaranManual(actor, {
        tagihanId: data.tagihanId,
        metode: data.metode,
        reference: data.reference ?? null,
        paidAt: data.dibayarPada ? wib(data.dibayarPada) : undefined,
        bukti: data.bukti,
      }),
  });
  revalidatePath(`/staf/admin-platform/tagihan/${tagihanId}`);
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: pembayaranManualMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: `Pembayaran dicatat. Bukti Pembayaran ${result.value.bukti.nomorBukti} terbit untuk Tagihan ${result.value.bukti.tagihan.nomorTagihan}.`,
  };
}

const hargaKhususSchema = z.object({
  tagihanId: z.uuid(),
  amount: z.coerce.number().int().positive(),
  alasan: z.string().trim().min(1).max(500),
  porsiMitra: z.coerce.number().int().min(0).optional(),
  catatanPorsiMitra: z.string().trim().max(500).optional(),
});

/**
 * Admin Platform sets a Harga Khusus on the order this Tagihan is for (spec,
 * Billing > Payouts; ticket 30's AC 3, 4): the Tagihan is cancelled and
 * replaced with the reduction as its own negative line, and the share the
 * Lokasi Mitra agreed to bear (if any) is recorded with it — one audited step.
 */
export async function tetapkanHargaKhususAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagihanId = String(formData.get("tagihanId") ?? "");
  const result = await guarded({
    action: "tagihan.tetapkan_harga_khusus",
    resource: () => tagihanResource(),
    schema: hargaKhususSchema,
    input: {
      tagihanId: formData.get("tagihanId"),
      amount: formData.get("amount"),
      alasan: formData.get("alasan"),
      porsiMitra: formData.get("porsiMitra") || undefined,
      catatanPorsiMitra: formData.get("catatanPorsiMitra") || undefined,
    },
    run: (actor, data) =>
      serverRuntime().billing.tetapkanHargaKhusus(actor, {
        tagihanId: data.tagihanId,
        amount: data.amount,
        alasan: data.alasan,
        porsiMitra: data.porsiMitra,
        catatanPorsiMitra: data.catatanPorsiMitra ?? null,
      }),
  });
  revalidatePath(`/staf/admin-platform/tagihan/${tagihanId}`);
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: hargaKhususMessage(result.value.reason) };
  const tagihan = result.value.tagihan;
  revalidatePath(`/staf/admin-platform/tagihan/${tagihan.id}`);
  return {
    status: "berhasil",
    message: `Harga Khusus dicatat. Tagihan ${tagihan.replacesNomorTagihan ?? tagihanId} diganti dengan ${tagihan.nomorTagihan}, total ${formatRupiah(tagihan.total)}.`,
  };
}

const batalkanSchema = z.object({ tagihanId: z.uuid() });

/**
 * Admin Platform reverses a "Dibayar langsung ke Lokasi Mitra" record (spec,
 * Billing > Payment; ticket 30's AC 2): the platform-fee Potongan it raised is
 * cancelled (or nothing has been raised yet), and the order's ordinary tariff
 * Pencairan is created on the next run instead. The Tagihan and its Bukti
 * Pembayaran are never touched.
 */
export async function batalkanPembayaranLangsungAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tagihanId = String(formData.get("tagihanId") ?? "");
  const result = await guarded({
    action: "pencairan.kelola",
    resource: () => pencairanResource(),
    schema: batalkanSchema,
    input: { tagihanId: formData.get("tagihanId") },
    run: (actor, data) => serverRuntime().payouts.batalkanPembayaranLangsung(actor, data),
  });
  revalidatePath(`/staf/admin-platform/tagihan/${tagihanId}`);
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  if (!result.value.ok) return { status: "gagal", message: batalkanMessage(result.value.reason) };
  return {
    status: "berhasil",
    message: "Pembayaran langsung dibatalkan. Tarif Pencairan pesanan ini akan terbit normal pada proses berikutnya.",
  };
}
