"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newTugasLapanganSchema, tugasLapanganTypes } from "@/domain/fieldwork";
import { semuaTugasLapanganResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const domainRefusalMessages: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  input_tidak_valid: "Periksa lagi isian Anda: subjek, alamat, tanggal rencana dan Petugas Lapangan wajib diisi.",
  bukan_petugas_lapangan: "Akun yang dipilih bukan Petugas Lapangan aktif.",
};

const formSchema = z.object({
  type: z.enum(tugasLapanganTypes),
  subject: z.string().trim().min(1).max(200),
  lokasiId: z.string().trim(),
  address: z.string().trim().min(1).max(500),
  pinLat: z.string(),
  pinLng: z.string(),
  plannedDate: z.iso.date(),
  assigneeAccountId: z.string().trim().min(1),
});

/** Admin Platform creates and assigns a Tugas Lapangan of any type to one Petugas Lapangan. */
export async function buatTugasLapangan(_previous: FormState, formData: FormData): Promise<FormState> {
  const input = {
    type: formData.get("type"),
    subject: formData.get("subject"),
    lokasiId: formData.get("lokasiId"),
    address: formData.get("address"),
    pinLat: formData.get("pinLat"),
    pinLng: formData.get("pinLng"),
    plannedDate: formData.get("plannedDate"),
    assigneeAccountId: formData.get("assigneeAccountId"),
  };
  const result = await guarded({
    fitur: "inti",
    action: "tugas_lapangan.buat",
    resource: () => semuaTugasLapanganResource(),
    schema: formSchema,
    input,
    run: async (actor, data) => {
      const rawLat = data.pinLat.trim();
      const rawLng = data.pinLng.trim();
      const lat = Number(rawLat.replace(",", "."));
      const lng = Number(rawLng.replace(",", "."));
      const pin = rawLat !== "" && rawLng !== "" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      const parsed = newTugasLapanganSchema.safeParse({
        type: data.type,
        subject: data.subject,
        lokasiId: data.lokasiId.trim() === "" ? null : data.lokasiId,
        address: data.address,
        pin,
        plannedDate: data.plannedDate,
        assigneeAccountId: data.assigneeAccountId,
      });
      if (!parsed.success) return { ok: false, reason: "input_tidak_valid" } as const;
      return serverRuntime().fieldwork.createTugasLapangan(actor, parsed.data);
    },
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const written = result.value;
  revalidatePath("/staf/admin-platform/tugas-lapangan");
  if (!written.ok) return { status: "gagal", message: domainRefusalMessages[written.reason] ?? "Gagal membuat Tugas Lapangan." };
  return { status: "berhasil", message: "Tugas Lapangan dibuat dan ditugaskan." };
}
