"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lokasiMitraResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

const GAGAL_AKHIRI: Record<string, string> = {
  hak_pakai_tidak_ditemukan: "Hak Pakai ini tidak ditemukan.",
  tagihan_belum_tidak_tertagih: "Tagihan ini belum dinyatakan Tidak Tertagih oleh Admin Platform.",
  hak_pakai_sudah_berakhir: "Hak Pakai ini sudah berakhir.",
};

/**
 * The Lokasi's own Admin Lokasi ends a Hak Pakai once Admin Platform declared
 * its Saat Duka Tagihan Tidak Tertagih (spec, Billing > Chasing; ticket 29's
 * AC 7). Never for a burial under an existing Hak Pakai — `pemesanan`'s own
 * guard, since only a Saat Duka grant order is found here.
 */
export async function akhiriHakPakaiTidakTertagih(_previous: FormState, formData: FormData): Promise<FormState> {
  const lokasiId = String(formData.get("lokasiId") ?? "");
  const result = await guarded({
    action: "hak_pakai.akhiri_tidak_tertagih",
    resource: () => lokasiMitraResource(lokasiId),
    schema: z.object({ hakPakaiId: z.uuid(), alasan: z.string().trim().max(500).optional() }),
    input: { hakPakaiId: formData.get("hakPakaiId"), alasan: formData.get("alasan") || undefined },
    run: (actor, data) => serverRuntime().pemesanan.akhiriHakPakaiTidakTertagih(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/staf/admin-lokasi/${lokasiId}/tagihan-lewat-jatuh-tempo`);
  if (!result.value.ok) return { status: "gagal", message: GAGAL_AKHIRI[result.value.reason] ?? "Gagal mengakhiri Hak Pakai." };
  return { status: "berhasil", message: "Hak Pakai diakhiri (Berakhir)." };
}
