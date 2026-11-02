"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { kedukaanResource } from "@/domain/identity";
import { statusKedukaanValues } from "@/domain/kedukaan/skema";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PESAN: Record<string, string> = {
  tidak_ditemukan: "Permintaan tidak ditemukan.",
  transisi_tidak_boleh: "Status itu tidak bisa dipilih dari status sekarang.",
  alasan_wajib: "Tulis alasan pembatalan untuk keluarga.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
};

const schema = z.object({
  permintaanId: z.uuid(),
  status: z.enum(statusKedukaanValues),
  catatan: z.string().max(1000).nullable(),
});

/** Admin Platform moves a Permintaan Kedukaan on (ADR 0010): Dihubungi, Selesai, or Dibatalkan with a reason. */
export async function pindahStatusKedukaan(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const catatan = formData.get("catatan");
  const hasil = await guarded({
    fitur: "inti",
    action: "kedukaan.kelola",
    resource: () => kedukaanResource(),
    schema,
    input: { permintaanId: formData.get("permintaanId"), status: formData.get("status"), catatan: typeof catatan === "string" && catatan.trim() ? catatan : null },
    run: (actor, data) => serverRuntime().kedukaan.pindahStatus(actor, data.permintaanId, { status: data.status, catatan: data.catatan }),
  });
  if (!hasil.ok) return { status: "gagal", message: guardMessage(hasil.error) };
  if (!hasil.value.ok) return { status: "gagal", message: PESAN[hasil.value.reason] ?? "Perubahan tidak disimpan." };
  revalidatePath("/staf/admin-platform/kedukaan");
  return { status: "berhasil", message: "Status disimpan; keluarga dikabari lewat email." };
}
