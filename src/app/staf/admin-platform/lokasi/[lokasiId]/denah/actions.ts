"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type RenumberActionResult = { ok: true; nomorMakam: string } | { ok: false; message: string };

function renumberMessage(reason: string, extra?: Record<string, unknown>): string {
  switch (reason) {
    case "petak_tidak_ditemukan":
      return "Tidak ada Petak dengan nomor itu di Lokasi ini.";
    case "nomor_wajib":
      return "Isi Nomor Makam baru.";
    case "nomor_sudah_dipakai": {
      const conflicts = extra?.conflicts as string[] | undefined;
      return `Nomor itu sudah dipakai${conflicts?.length ? `: ${conflicts.join(", ")}` : ""}.`;
    }
    case "tidak_berwenang":
      return "Hanya Admin Platform yang dapat mengubah nomor Petak.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "belum_masuk":
      return "Sesi Anda sudah berakhir. Silakan masuk lagi.";
    default:
      return "Nomor tidak bisa diubah. Coba lagi.";
  }
}

const findPetakSchema = z.object({ lokasiId: z.uuid(), nomorMakam: z.string().trim().min(1) });

/** Finds the Petak named `nomorMakam` (current or an earlier, renumbered one), so Admin Platform can confirm which one before renaming it. */
export async function findPetakAction(input: z.input<typeof findPetakSchema>): Promise<{ ok: true; petakId: string; nomorMakam: string } | { ok: false; message: string }> {
  const result = await guarded({
    fitur: "inti",
    action: "denah.lihat",
    resource: () => lokasiMitraResource(input.lokasiId),
    schema: findPetakSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.asStaff(actor).findPetak(data.lokasiId, data.nomorMakam),
  });
  if (!result.ok) return { ok: false, message: renumberMessage(result.error) };
  if (!result.value) return { ok: false, message: "Tidak ada Petak dengan nomor itu di Lokasi ini." };
  return { ok: true, petakId: result.value.petakId, nomorMakam: result.value.nomorMakam };
}

const renumberSchema = z.object({ lokasiId: z.uuid(), petakId: z.uuid(), nomorMakamBaru: z.string().trim().min(1).max(60) });

/** Admin Platform renumbers a Petak Makam; its old Nomor Makam is kept as a hidden alias (spec, story 169). */
export async function renumberPetakAction(input: z.input<typeof renumberSchema>): Promise<RenumberActionResult> {
  const result = await guarded({
    fitur: "inti",
    action: "petak.nomor_ulang",
    resource: () => lokasiMitraResource(input.lokasiId),
    schema: renumberSchema,
    input,
    run: (actor, data) => serverRuntime().inventory.renumberPetak(actor, data.lokasiId, data.petakId, data.nomorMakamBaru),
  });
  if (!result.ok) return { ok: false, message: renumberMessage(result.error) };
  const written = result.value;
  if (!written.ok) {
    const refusal = written as { ok: false; reason: string } & Record<string, unknown>;
    const extra: Record<string, unknown> = { ...refusal };
    delete extra.ok;
    delete extra.reason;
    return { ok: false, message: renumberMessage(refusal.reason, extra) };
  }
  revalidatePath(`/staf/admin-platform/lokasi/${input.lokasiId}/denah`);
  return { ok: true, nomorMakam: written.nomorMakam };
}
