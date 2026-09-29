"use server";

import { revalidatePath } from "next/cache";
import { keluhanLayananResource } from "@/domain/identity";
import { putuskanKeluhanSchema, sesuaikanPencairanKeluhanSchema } from "@/domain/layanan/pesanan-schema";
import { putuskanKeluhanMessages } from "@/lib/layanan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../../form-state";
import { guardMessage } from "../../../messages";

function revalidate(keluhanId: string): void {
  revalidatePath(`/staf/admin-platform/keluhan/${keluhanId}`);
  revalidatePath("/staf/admin-platform/antrean");
}

/**
 * Admin Platform decides one Keluhan: rejected, a redo, or a refund of the job's line. Thin, in order:
 * authenticate, check the role, validate with Zod, call the Layanan module — which is where the Pencairan
 * and the refund request follow from the decision.
 */
export async function putuskanKeluhanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const keluhanId = String(formData.get("keluhanId") ?? "");
  const result = await guarded({
    action: "keluhan.kelola",
    resource: () => keluhanLayananResource(),
    schema: putuskanKeluhanSchema,
    input: { keluhanId, keputusan: formData.get("keputusan"), catatan: formData.get("catatan") },
    run: (actor, data) => serverRuntime().layanan.putuskanKeluhan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidate(keluhanId);
  if (!result.value.ok) return { status: "gagal", message: putuskanKeluhanMessages[result.value.reason] ?? "Keputusan gagal disimpan." };
  return { status: "berhasil", message: "Keputusan tersimpan." };
}

/** Admin Platform overrides what the job pays its fulfiller after the Keluhan, with the note that must go with it. */
export async function sesuaikanPencairanKeluhanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const keluhanId = String(formData.get("keluhanId") ?? "");
  const result = await guarded({
    action: "keluhan.kelola",
    resource: () => keluhanLayananResource(),
    schema: sesuaikanPencairanKeluhanSchema,
    input: { keluhanId, amount: formData.get("amount"), catatan: formData.get("catatan") },
    run: (actor, data) => serverRuntime().layanan.sesuaikanPencairanKeluhan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidate(keluhanId);
  if (!result.value.ok) return { status: "gagal", message: putuskanKeluhanMessages[result.value.reason] ?? "Penyesuaian gagal disimpan." };
  return { status: "berhasil", message: "Jumlah pencairan disesuaikan." };
}
