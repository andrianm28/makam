"use server";

import { redirect } from "next/navigation";
import { pemesananResource } from "@/domain/identity";
import { ajukanPermohonanSchema, berkasUntukJalur, jalurManual, type JalurManual } from "@/domain/perpanjangan";
import { alasanPermohonanText } from "@/lib/permohonan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type BerkasActionState = { status: "idle" } | { status: "gagal"; message: string };

/** The document a family picked for one slot of the form, or null when it left it empty. */
async function fileOf(formData: FormData, name: string, kunci: string) {
  const file = formData.get(name);
  return file instanceof File && file.size > 0 ? { kunci, body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } : null;
}

/**
 * The applicant files a manual Perpanjangan request (KTP, heir or claim) with its documents. The
 * documents go to the private FileStore through the Perpanjangan module; the Akun asking is the one
 * signed in, and it is that Akun's Email Terverifikasi an approval later records on the Hak Pakai.
 */
export async function ajukanPermohonanAction(_previous: BerkasActionState, formData: FormData): Promise<BerkasActionState> {
  const jalur = String(formData.get("jalur") ?? "");
  const daftar = (jalurManual as readonly string[]).includes(jalur) ? berkasUntukJalur(jalur as JalurManual) : [];
  const berkas = (await Promise.all(daftar.map((satu) => fileOf(formData, `berkas_${satu.kunci}`, satu.kunci)))).filter((satu) => satu !== null);
  const catatan = String(formData.get("catatan") ?? "");
  const result = await guarded({
    fitur: "perpanjangan_lanjutan",
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: ajukanPermohonanSchema,
    input: {
      hakPakaiId: formData.get("hakPakaiId"),
      jalur,
      nama: formData.get("nama"),
      nomorTelepon: formData.get("nomorTelepon"),
      ...(catatan === "" ? {} : { catatan }),
      berkas,
    },
    run: (actor, data) => serverRuntime().perpanjangan.ajukanPermohonan({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) {
    if (result.error === "belum_masuk") return { status: "gagal", message: "Silakan masuk lagi untuk mengajukan permohonan." };
    return { status: "gagal", message: "Periksa lagi isian Anda: nama dan nomor telepon wajib diisi." };
  }
  if (result.value.ok) redirect(`/perpanjangan/permohonan/${result.value.permohonanId}`);
  const judul = new Map(daftar.map((satu) => [satu.kunci, satu.label]));
  return { status: "gagal", message: alasanPermohonanText(result.value, (kunci) => judul.get(kunci) ?? kunci) };
}
