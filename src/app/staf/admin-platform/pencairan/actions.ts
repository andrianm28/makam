"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pencairanResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

const PATH = "/staf/admin-platform/pencairan";

/** The transfer proof, as the form's file input hands it over. */
async function buktiFromForm(formData: FormData) {
  const file = formData.get("bukti");
  if (!(file instanceof File) || file.size === 0) return null;
  return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

const GAGAL_TAHAN: Record<string, string> = {
  tidak_ditemukan: "Item Pencairan tidak ditemukan.",
  sudah_selesai: "Item ini sudah dicairkan atau dibatalkan.",
  alasan_tidak_valid: "Alasan wajib diisi (paling banyak 500 karakter).",
};

/** Admin Platform holds one item out of the run with a reason (spec, Billing > Payouts: "Items can be held out with a reason"). */
export async function tahanItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "pencairan.kelola",
    resource: () => pencairanResource(),
    schema: z.object({ itemId: z.uuid(), alasan: z.string().trim().min(1).max(500) }),
    input: { itemId: formData.get("itemId"), alasan: formData.get("alasan") },
    run: (actor, data) => serverRuntime().payouts.tahanPencairan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_TAHAN[result.value.reason] ?? "Item gagal ditahan." };
  return { status: "berhasil", message: "Item ditahan dari Pencairan." };
}

/** Admin Platform puts a held item back into the run. */
export async function lepaskanItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "pencairan.kelola",
    resource: () => pencairanResource(),
    schema: z.object({ itemId: z.uuid() }),
    input: { itemId: formData.get("itemId") },
    run: (actor, data) => serverRuntime().payouts.tahanPencairan(actor, { itemId: data.itemId, alasan: null }),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_TAHAN[result.value.reason] ?? "Item gagal dilepaskan." };
  return { status: "berhasil", message: "Item kembali masuk Pencairan." };
}

const GAGAL_TRANSFER: Record<string, string> = {
  tidak_ditemukan: "Item Pencairan tidak ditemukan.",
  item_tidak_valid: "Tidak ada item yang dicairkan.",
  item_tidak_tersedia: "Ada item yang belum jatuh tempo, sedang ditahan, atau sudah dicairkan. Muat ulang halaman ini.",
  item_beda_penerima: "Item ini bukan milik satu penerima yang sama.",
  potongan_tidak_tersedia: "Ada Potongan yang sudah tidak berjalan. Muat ulang halaman ini.",
  potongan_ke_mitra_jasa_tidak_boleh: "Mitra Jasa tidak pernah dikenai Potongan.",
  tidak_ada_yang_ditransfer: "Setelah Potongan, tidak ada yang perlu ditransfer.",
  netto_negatif: "Potongan melebihi item yang jatuh tempo: selesaikan Potongan di luar Pencairan.",
  tanggal_tidak_valid: "Tanggal transfer tidak valid atau di masa depan.",
  berkas_tidak_didukung: "Bukti transfer harus berupa foto atau scan (JPG, PNG, PDF), paling besar 10 MB.",
  pengaturan_operator_belum_diisi: "Pengaturan Operator belum diisi.",
  jumlah_terlalu_besar: "Jumlahnya terlalu besar untuk satu transfer.",
};

const terbitkanSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
  potonganIds: z.array(z.uuid()),
  ditransferPada: z.iso.date(),
  bukti: z.object({ body: z.instanceof(Uint8Array), contentType: z.string() }),
});

/** Admin Platform transfers by hand, uploads the proof and enters the date: issues one Bukti Pencairan for one recipient. */
export async function terbitkanBuktiPencairanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const bukti = await buktiFromForm(formData);
  const result = await guarded({
    fitur: "inti",
    action: "pencairan.kelola",
    resource: () => pencairanResource(),
    schema: terbitkanSchema,
    input: {
      itemIds: formData.getAll("itemIds"),
      potonganIds: formData.getAll("potonganIds"),
      ditransferPada: formData.get("ditransferPada"),
      bukti,
    },
    run: (actor, data) => serverRuntime().payouts.terbitkanBuktiPencairan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(PATH);
  revalidatePath("/staf/admin-platform/antrean");
  revalidatePath("/staf/admin-platform/transfer");
  if (!result.value.ok) return { status: "gagal", message: GAGAL_TRANSFER[result.value.reason] ?? "Transfer gagal dicatat." };
  return { status: "berhasil", message: `Bukti Pencairan ${result.value.bukti.nomorBukti} diterbitkan dan dikirim ke penerima.` };
}
