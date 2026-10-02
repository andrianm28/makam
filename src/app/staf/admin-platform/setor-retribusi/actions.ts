"use server";

import { revalidatePath } from "next/cache";
import { setorRetribusiResource } from "@/domain/identity";
import { catatSetorRetribusiSchema, newTugasLapanganSchema } from "@/domain/fieldwork";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/setor-retribusi";

/** The receipt, as the form's file input hands it over. */
async function buktiFromForm(formData: FormData) {
  const file = formData.get("bukti");
  if (!(file instanceof File) || file.size === 0) return null;
  return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

const CATAT_GAGAL: Record<string, string> = {
  tagihan_tidak_ada: "Tagihan ini tidak punya Retribusi Pemda yang perlu disetor.",
  sudah_disetor: "Setor Retribusi untuk Tagihan ini sudah tercatat.",
  tanggal_di_masa_depan: "Tanggal setor tidak boleh di masa depan.",
  berkas_tidak_didukung: "Bukti setor harus berupa foto atau scan (JPG, PNG, WEBP, PDF).",
  berkas_gagal_disimpan: "Bukti setor gagal disimpan.",
  input_tidak_valid: "Periksa lagi isian Anda.",
};

/**
 * Admin Platform, or the Petugas who paid the town in person, records the
 * payment of a Retribusi Pemda line with its proof. One domain call, and it
 * closes the Tier 3 "Setor Retribusi" row because the row is a projection of the
 * same state.
 */
export async function catatSetorRetribusiAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const bukti = await buktiFromForm(formData);
  const result = await guarded({
    fitur: "inti",
    action: "setor_retribusi.kelola",
    resource: () => setorRetribusiResource(),
    schema: catatSetorRetribusiSchema,
    input: {
      tagihanId: formData.get("tagihanId"),
      dibayarkanPada: formData.get("dibayarkanPada"),
      bukti,
      catatan: formData.get("catatan") ?? "",
    },
    run: (actor, data) => serverRuntime().fieldwork.catatSetorRetribusi(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: CATAT_GAGAL[result.value.reason] ?? "Gagal mencatat setor." };
  return {
    status: "berhasil",
    message: `Setor Retribusi ${result.value.setor.nomorTagihan} tercatat. Baris Antrean ditutup.`,
  };
}

/**
 * Admin Platform hands an open Setor Retribusi to one Petugas Lapangan, who
 * pays the town in person and closes the row by completing that Tugas with the
 * receipt. The Taske's own type carries the Tagihan id, so the proof the Petugas
 * uploads is the recording's evidence.
 */
export async function tugaskanSetorRetribusi(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "setor_retribusi.kelola",
    resource: () => setorRetribusiResource(),
    schema: newTugasLapanganSchema,
    input: {
      type: "setor_retribusi",
      subject: `Setor Retribusi ${String(formData.get("nomorTagihan") ?? "")}`,
      lokasiId: null,
      address: formData.get("address"),
      pin: null,
      plannedDate: formData.get("plannedDate"),
      assigneeAccountId: formData.get("assigneeAccountId"),
      tagihanId: formData.get("tagihanId"),
    },
    run: (actor, data) => serverRuntime().fieldwork.createTugasLapangan(actor, data),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  if (!result.value.ok) return { status: "gagal", message: "Tugas Setor Retribusi gagal dibuat." };
  return { status: "berhasil", message: `Tugas Setor Retribusi dibuat dan Peringatan Staf dikirim ke Petugasnya.` };
}
