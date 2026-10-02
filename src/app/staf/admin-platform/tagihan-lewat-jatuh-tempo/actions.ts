"use server";

import { revalidatePath } from "next/cache";
import { antreanResource } from "@/domain/identity";
import { catatPanggilanSchema, tambahCatatanTagihanSchema } from "@/domain/notifications";
import { nyatakanTidakTertagihSchema } from "@/domain/pemesanan";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/tagihan-lewat-jatuh-tempo";

/** Admin Platform logs a Chasing call (spec, Billing > Chasing; ticket 29): the same "Telepon Pemesan" mechanism ticket 20 built. */
export async function catatPanggilanTagihan(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "telepon_pemesan.catat",
    resource: () => antreanResource(),
    schema: catatPanggilanSchema,
    input: {
      teleponId: formData.get("teleponId"),
      hasil: formData.get("hasil"),
      catatan: formData.get("catatan") ?? undefined,
    },
    run: (actor, data) => serverRuntime().notifications.catatPanggilan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Baris panggilan ini sudah ditutup." };
  return { status: "berhasil", message: "Panggilan dicatat." };
}

const GAGAL_TIDAK_TERTAGIH: Record<string, string> = {
  tidak_ditemukan: "Tagihan ini tidak ditemukan.",
  tagihan_tidak_lewat_jatuh_tempo: "Tagihan ini tidak sedang Lewat Jatuh Tempo.",
  belum_h30: "Belum H+30 sejak Tagihan ini Lewat Jatuh Tempo.",
  belum_ada_panggilan: "Catat minimal satu panggilan dulu sebelum menyatakan Tidak Tertagih.",
  input_tidak_valid: "Periksa lagi isian Anda.",
};

/**
 * Admin Platform declares a chased Tagihan Tidak Tertagih (spec, Billing >
 * Chasing; ticket 29): guarded() → Zod → the Pemesanan module's one call, which
 * holds the H+30 and logged-call guard, the Entri Audit and the queued Admin
 * Lokasi push in one transaction. This action never calls Billing itself.
 */
export async function nyatakanTidakTertagih(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "tagihan.nyatakan_tidak_tertagih",
    resource: () => antreanResource(),
    schema: nyatakanTidakTertagihSchema,
    input: { tagihanId: formData.get("tagihanId"), alasan: formData.get("alasan") || undefined },
    run: (actor, data) => serverRuntime().pemesanan.nyatakanTidakTertagih(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) {
    return { status: "gagal", message: GAGAL_TIDAK_TERTAGIH[result.value.reason] ?? "Gagal menyatakan Tidak Tertagih." };
  }
  return { status: "berhasil", message: `Tagihan ${result.value.tagihan.nomorTagihan} dinyatakan Tidak Tertagih.` };
}

/** Admin Platform adds a standalone note to a chased Tagihan's call log, closing no row. */
export async function tambahCatatanTagihan(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "telepon_pemesan.catat",
    resource: () => antreanResource(),
    schema: tambahCatatanTagihanSchema,
    input: { tagihanId: formData.get("tagihanId"), catatan: formData.get("catatan") },
    run: (actor, data) => serverRuntime().notifications.tambahCatatanTagihan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Catatan tidak bisa disimpan: Tagihan ini tidak sedang dikejar atau catatan kosong." };
  return { status: "berhasil", message: "Catatan ditambahkan." };
}

