"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { buktiPekerjaanSchema, kirimPesanThreadSchema, mulaiPekerjaanSchema } from "@/domain/layanan/pesanan-schema";
import { pekerjaanPesanMessages } from "@/lib/layanan-labels";
import { pesanThreadMessages, type PesanThreadState } from "@/lib/thread-labels";
import { guarded } from "@/server/guard";
import { inputPesanThread } from "@/server/thread-form";
import { serverRuntime } from "@/server/runtime";

/** What a staff step's form state carries back to the screen. */
export type PekerjaanActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/**
 * The proof the in-app camera hands over: the captured file, the kind it stands
 * for, and the moment the camera produced it. The browser's own clock is the
 * witness, because the phone in the Admin Lokasi's hand is (AC 4: "captured
 * through the browser camera in-app (no gallery upload), timestamped").
 *
 * The file arrives in the `FormData` the screen builds in its own event handler:
 * there is no file input on the screen for a gallery to reach, and a photo is not
 * something a hidden field could carry as text.
 */
const unggahSchema = z.object({
  lokasiId: z.uuid(),
  pekerjaanId: z.uuid(),
  kind: z.enum(["foto_sebelum", "foto_sesudah", "video"]),
  takenAt: z.coerce.date(),
  file: z.custom<File>((value) => value instanceof File && value.size > 0, "Bukti belum diterima."),
});

/** The Admin Lokasi starts a job: Sedang Dikerjakan, from now. */
export async function mulaiPekerjaanLokasi(_previous: PekerjaanActionState, formData: FormData): Promise<PekerjaanActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "layanan.kerjakan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: mulaiPekerjaanSchema,
    input: { pekerjaanId: formData.get("pekerjaanId") },
    run: (actor, data) => serverRuntime().layanan.mulaiPekerjaan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: pesan(result.error) };
  revalidateHalaman(lokasiId, String(formData.get("pekerjaanId") ?? ""));
  if (!result.value.ok) return { status: "gagal", message: pesan(result.value.reason) };
  return { status: "berhasil", message: "Pekerjaan ditandai sedang dikerjakan." };
}

/** The Admin Lokasi saves one proof they just captured. */
export async function unggahBuktiLokasi(_previous: PekerjaanActionState, formData: FormData): Promise<PekerjaanActionState> {
  const parsed = unggahSchema.safeParse({
    lokasiId: formData.get("lokasiId"),
    pekerjaanId: formData.get("pekerjaanId"),
    kind: formData.get("kind"),
    takenAt: formData.get("takenAt"),
    file: formData.get("file"),
  });
  if (!parsed.success) return { status: "gagal", message: pesan("input_tidak_valid") };
  const { lokasiId, kind, takenAt, file, pekerjaanId } = parsed.data;
  const result = await guarded({
    fitur: "inti",
    action: "layanan.kerjakan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: buktiPekerjaanSchema,
    input: {
      pekerjaanId,
      kind,
      takenAt,
      // The bytes travel as the array the File holds, never as the File itself.
      file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type },
    },
    run: (actor, data) => serverRuntime().layanan.unggahBuktiPekerjaan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: pesan(result.error) };
  revalidateHalaman(lokasiId, pekerjaanId);
  if (!result.value.ok) return { status: "gagal", message: pesan(result.value.reason) };
  return { status: "berhasil", message: "Bukti tersimpan." };
}

/** What this form carries: the Lokasi whose Admin Lokasi is writing, and the Petak. */
const petakFormSchema = z.object({ lokasiId: z.uuid(), petakId: z.uuid() });

/**
 * **The exit of the Hak Pakai gate** (AC 1): this grave's Hak Pakai is flagged Perlu
 * Verifikasi, so the job is not scheduled, and only this Lokasi's Admin Lokasi can
 * complete it. The form names the Petak; which Hak Pakai that is, and whether it is
 * still flagged, is the Inventory module's business and is read through its own
 * public function, never assumed here.
 *
 * The job does not move on this call — the payment that would have scheduled it is
 * already recorded — so the screen says the work joins the Lokasi's list on the
 * next tick rather than pretending it is scheduled now.
 */
export async function selesaikanVerifikasiHakPakaiLokasi(_previous: PekerjaanActionState, formData: FormData): Promise<PekerjaanActionState> {
  const parsed = petakFormSchema.safeParse({ lokasiId: formData.get("lokasiId"), petakId: formData.get("petakId") });
  if (!parsed.success) return { status: "gagal", message: pesan("input_tidak_valid") };
  const { lokasiId, petakId } = parsed.data;
  const result = await guarded({
    fitur: "inti",
    action: "hak_pakai.selesaikan_verifikasi",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ petakId: z.uuid() }),
    input: { petakId },
    run: (actor, data) => serverRuntime().inventory.selesaikanVerifikasiHakPakai(actor, lokasiId, data),
  });
  if (!result.ok) return { status: "gagal", message: pesan(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
  if (!result.value.ok) return { status: "gagal", message: pesan(result.value.reason) };
  return { status: "berhasil", message: "Hak Pakai dilengkapi. Pekerjaan ini masuk daftar Antrean pada tick berikutnya." };
}

/** The Admin Lokasi marks a job Selesai, and the Pemesan is sent its proof link. */
export async function selesaikanPekerjaanLokasi(_previous: PekerjaanActionState, formData: FormData): Promise<PekerjaanActionState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "layanan.kerjakan",
    resource: () => lokasiMitraResource(lokasiId),
    schema: mulaiPekerjaanSchema,
    input: { pekerjaanId: formData.get("pekerjaanId") },
    run: (actor, data) => serverRuntime().layanan.selesaikanPekerjaan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: pesan(result.error) };
  revalidateHalaman(lokasiId, String(formData.get("pekerjaanId") ?? ""));
  if (!result.value.ok) {
    // The screen already names what is missing; the message here says the same thing
    // to anyone who arrives by keyboard, so the two never disagree.
    const kurang = "kurang" in result.value && result.value.kurang ? result.value.kurang : [];
    return { status: "gagal", message: kurang.length > 0 ? `${pesan(result.value.reason)} Masih kurang: ${kurang.join(", ")}.` : pesan(result.value.reason) };
  }
  return { status: "berhasil", message: "Pekerjaan selesai. Bukti sudah dikirim ke pemesan." };
}

function revalidateHalaman(lokasiId: string, pekerjaanId: string): void {
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/pekerjaan/${pekerjaanId}`);
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/antrean`);
}

/** Why a step was refused, saying what to do next. */
function pesan(reason: string): string {
  return pekerjaanPesanMessages[reason as keyof typeof pekerjaanPesanMessages] ?? "Periksa lagi isian Anda.";
}

/**
 * The Admin Lokasi writes in the thread of a job at its own Lokasi. Thin, in order: authenticate, check the
 * role on that Lokasi, validate with Zod, call the Layanan module — which emails the Pemesan a link, never the message.
 */
export async function kirimPesanThreadLokasi(_previous: PesanThreadState, formData: FormData): Promise<PesanThreadState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    fitur: "inti",
    action: "layanan.lihat_staf",
    resource: () => lokasiMitraResource(lokasiId),
    schema: kirimPesanThreadSchema,
    input: await inputPesanThread(formData),
    run: (actor, data) => serverRuntime().layanan.kirimPesanStaf(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: pesanThreadMessages[result.error] ?? "Periksa lagi isian Anda." };
  revalidateHalaman(lokasiId, String(formData.get("pekerjaanId") ?? ""));
  if (!result.value.ok) return { status: "gagal", message: pesanThreadMessages[result.value.reason] ?? "Pesan gagal dikirim." };
  return { status: "berhasil", message: "Pesan terkirim. Pemesan diberi tahu lewat email." };
}
