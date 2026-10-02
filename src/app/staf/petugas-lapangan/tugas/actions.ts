"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiFacilities } from "@/domain/lokasi";
import { tugasLapanganResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const domainRefusalMessages: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  tidak_ditemukan: "Tugas Lapangan ini tidak ditemukan.",
  sudah_selesai: "Tugas Lapangan ini sudah Selesai.",
  form_tidak_valid: "Periksa lagi isian formulirnya.",
  unggah_kurang: "Unggah dulu setiap berkas yang wajib sebelum menandai Selesai.",
  berkas_tidak_didukung: "Berkas harus JPG, PNG, WebP atau PDF (isi berkas diperiksa).",
  berkas_gagal_disimpan: "Berkas tidak bisa disimpan. Coba lagi.",
  kunjungan_tidak_valid: "Periksa lagi pin dan fasilitas: pin harus di Indonesia.",
  catatan_tidak_valid: "Catatan Cek Denah terlalu panjang.",
  // A Setor Retribusi Tugas is refused for two different reasons, and each one
  // sends the Petugas somewhere else (ticket 45).
  setor_tidak_tercatat:
    "Tagihan ini tidak punya Retribusi Pemda yang perlu disetor, jadi Tugas ini tidak bisa diselesaikan. Hubungi Admin Platform.",
  sudah_disetor: "Setor Retribusi untuk Tagihan ini sudah tercatat. Hubungi Admin Platform.",
};

const facilityKeys = Object.keys(lokasiFacilities) as [string, ...string[]];

const inputSchema = z.object({
  id: z.uuid(),
  type: z.enum(["kunjungan_verifikasi", "cek_denah", "ambil_surat_pengantar", "berkas_iptm", "survei_wakaf"]),
});

/** The assigned Petugas Lapangan marks a Tugas Lapangan Selesai: its type-specific form and required uploads. */
export async function selesaikanTugas(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsedInput = inputSchema.safeParse({ id: formData.get("id"), type: formData.get("type") });
  if (!parsedInput.success) return { status: "gagal", message: "Tugas Lapangan tidak valid." };
  const { id, type } = parsedInput.data;

  // Each required-upload kind has its own file input, named "uploads_<kind>" (so a file always carries its kind).
  const uploads: { kind: string; file: { body: Uint8Array; contentType: string } }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("uploads_") || !(value instanceof File) || value.size === 0) continue;
    uploads.push({ kind: key.slice("uploads_".length), file: { body: new Uint8Array(await value.arrayBuffer()), contentType: value.type } });
  }

  let form: unknown;
  if (type === "kunjungan_verifikasi") {
    const rawLat = String(formData.get("pinLat") ?? "").trim();
    const rawLng = String(formData.get("pinLng") ?? "").trim();
    const lat = Number(rawLat.replace(",", "."));
    const lng = Number(rawLng.replace(",", "."));
    form = {
      addressConfirmed: formData.get("addressConfirmed") === "on",
      pin: rawLat !== "" && rawLng !== "" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      facilities: {
        checked: formData.getAll("facilities").map(String).filter((value) => (facilityKeys as string[]).includes(value)),
        note: String(formData.get("facilitiesNote") ?? ""),
      },
      note: String(formData.get("note") ?? ""),
    };
  } else if (type === "cek_denah") {
    form = { sesuaiDenah: formData.get("sesuaiDenah") === "on", note: String(formData.get("note") ?? "") };
  } else {
    form = { note: String(formData.get("note") ?? "") };
  }

  const result = await guarded({
    fitur: "inti",
    action: "tugas_lapangan.selesaikan",
    resource: () => tugasLapanganResource(id),
    schema: z.object({}),
    input: {},
    run: (actor) => serverRuntime().fieldwork.completeTugasLapangan(actor, id, { form, uploads }),
  });

  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/petugas-lapangan/tugas/${id}`);
  revalidatePath("/staf/petugas-lapangan/tugas");
  const written = result.value;
  if (!written.ok) return { status: "gagal", message: domainRefusalMessages[written.reason] ?? "Gagal menandai Selesai." };
  return { status: "berhasil", message: "Tugas Lapangan ditandai Selesai." };
}
