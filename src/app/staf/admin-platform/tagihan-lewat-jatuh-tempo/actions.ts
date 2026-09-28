"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { antreanResource } from "@/domain/identity";
import { catatPanggilanSchema } from "@/domain/notifications";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/tagihan-lewat-jatuh-tempo";

/** Admin Platform logs a Chasing call (spec, Billing > Chasing; ticket 29): the same "Telepon Pemesan" mechanism ticket 20 built. */
export async function catatPanggilanTagihan(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
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
};

/**
 * Admin Platform declares a chased Tagihan Tidak Tertagih (spec, Billing >
 * Chasing; ticket 29): guarded on H+30 and at least one logged call by
 * `billing.declareTidakTertagih` itself, never by this action. On success,
 * that Lokasi's Admin Lokasi is pushed once (`notifications.pushTidakTertagih`
 * — the one call in the app that crosses Billing and Notifications after the
 * fact, since neither module may import the other; ticket 29's Comments).
 */
export async function nyatakanTidakTertagih(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "tagihan.nyatakan_tidak_tertagih",
    resource: () => antreanResource(),
    schema: z.object({ tagihanId: z.uuid() }),
    input: { tagihanId: formData.get("tagihanId") },
    run: (_actor, data) => serverRuntime().billing.declareTidakTertagih(data.tagihanId),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_TIDAK_TERTAGIH[result.value.reason] ?? "Gagal menyatakan Tidak Tertagih." };
  await serverRuntime().notifications.pushTidakTertagih(result.value.tagihan);
  return { status: "berhasil", message: `Tagihan ${result.value.tagihan.nomorTagihan} dinyatakan Tidak Tertagih.` };
}
