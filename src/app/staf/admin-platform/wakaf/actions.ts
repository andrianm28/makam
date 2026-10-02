"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { wakafResource, type Actor } from "@/domain/identity";
import {
  cocokkanNazhirSchema,
  hapusNazhirSchema,
  nazhirInputSchema,
  pindahStatusSchema,
  tulisCatatanSchema,
  ubahNazhirSchema,
} from "@/domain/wakaf/skema";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

/** Words for every reason the Wakaf module can refuse a staff write. */
const pesanDomain: Record<string, string> = {
  tidak_berwenang: guardMessage("tidak_berwenang"),
  perlu_totp: guardMessage("perlu_totp"),
  input_tidak_valid: guardMessage("input_tidak_valid"),
  pengajuan_tidak_ditemukan: "Pengajuan Wakaf ini tidak ditemukan.",
  nazhir_tidak_ditemukan: "Nazhir ini tidak ditemukan.",
  transisi_tidak_valid: "Status itu tidak bisa dipilih dari status sekarang.",
  tanggal_wajib: "Isi tanggalnya: tanggal survei untuk Survei Dijadwalkan, tanggal ikrar untuk Menunggu Ikrar.",
  petugas_wajib: "Pilih Petugas Lapangan yang melakukan survei.",
  petugas_tidak_valid: "Akun yang dipilih bukan Petugas Lapangan aktif.",
  alasan_wajib: "Isi alasannya; Wakif akan membacanya.",
  hasil_wajib: "Unggah scan AIW atau sertipikat untuk menyelesaikan Pengajuan.",
  berkas_tidak_didukung: "Berkas harus PDF, JPG atau PNG, paling besar 8 MB.",
  penyimpanan_belum_tersedia: "Penyimpanan berkas belum tersedia. Coba lagi nanti.",
};

type Hasil = { ok: true } | { ok: false; reason: string };

async function tulis<S extends z.ZodType>(options: {
  schema: S;
  input: unknown;
  run: (actor: Actor, data: z.infer<S>) => Promise<Hasil>;
  disimpan: string;
  path?: string;
}): Promise<FormState> {
  const hasil = await guarded({
    action: "wakaf.kelola",
    resource: () => wakafResource(),
    schema: options.schema,
    input: options.input,
    run: options.run,
  });
  if (!hasil.ok) return { status: "gagal", message: guardMessage(hasil.error) };
  if (!hasil.value.ok) return { status: "gagal", message: pesanDomain[hasil.value.reason] ?? guardMessage("input_tidak_valid") };
  revalidatePath("/staf/admin-platform/wakaf");
  if (options.path) revalidatePath(options.path);
  return { status: "berhasil", message: options.disimpan };
}

function teks(formData: FormData, nama: string): string | undefined {
  const nilai = formData.get(nama);
  return typeof nilai === "string" && nilai.trim() !== "" ? nilai : undefined;
}

const nazhirForm = (formData: FormData) => ({
  nama: formData.get("nama"),
  jenis: formData.get("jenis"),
  kabKota: formData.get("kabKota"),
  kontak: formData.get("kontak"),
  nomorBwi: formData.get("nomorBwi"),
});

/** Admin Platform adds a Nazhir to the list. */
export async function tambahNazhirDaftar(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  return tulis({
    schema: nazhirInputSchema,
    input: nazhirForm(formData),
    run: (actor, data) => serverRuntime().wakaf.tambahNazhir(actor, data),
    disimpan: "Nazhir ditambahkan.",
  });
}

/** Admin Platform changes a Nazhir. */
export async function ubahNazhirDaftar(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  return tulis({
    schema: ubahNazhirSchema,
    input: { ...nazhirForm(formData), nazhirId: formData.get("nazhirId") },
    run: (actor, data) => serverRuntime().wakaf.ubahNazhir(actor, data),
    disimpan: "Nazhir disimpan.",
  });
}

/** Admin Platform removes a Nazhir; Pengajuan that name it keep the name. */
export async function hapusNazhirDaftar(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  return tulis({
    schema: hapusNazhirSchema,
    input: { nazhirId: formData.get("nazhirId") },
    run: (actor, data) => serverRuntime().wakaf.hapusNazhir(actor, data),
    disimpan: "Nazhir dihapus.",
  });
}

/** Admin Platform moves a Pengajuan to its next status; the date, reason, Petugas or scan the status needs ride along. */
export async function pindahStatusPengajuan(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const berkas = formData.get("hasil");
  const hasil =
    berkas instanceof File && berkas.size > 0
      ? { kunci: "lainnya", body: new Uint8Array(await berkas.arrayBuffer()), contentType: berkas.type }
      : undefined;
  const pengajuanId = formData.get("pengajuanId");
  return tulis({
    schema: pindahStatusSchema,
    input: {
      pengajuanId,
      status: formData.get("status"),
      tanggal: teks(formData, "tanggal"),
      alasan: teks(formData, "alasan"),
      petugasAccountId: teks(formData, "petugasAccountId"),
      catatanWakif: teks(formData, "catatanWakif"),
      hasil,
    },
    run: (actor, data) => serverRuntime().wakaf.pindahStatus(actor, data),
    disimpan: "Status diperbarui.",
    path: `/staf/admin-platform/wakaf/${String(pengajuanId)}`,
  });
}

/** Admin Platform writes a note: to the Wakif, or internal. */
export async function tulisCatatanPengajuan(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const pengajuanId = formData.get("pengajuanId");
  return tulis({
    schema: tulisCatatanSchema,
    input: { pengajuanId, jenis: formData.get("jenis"), isi: formData.get("isi") },
    run: (actor, data) => serverRuntime().wakaf.tulisCatatan(actor, data),
    disimpan: "Catatan disimpan.",
    path: `/staf/admin-platform/wakaf/${String(pengajuanId)}`,
  });
}

/** Admin Platform matches a Pengajuan to a Nazhir on the list. */
export async function cocokkanNazhirPengajuan(_sebelumnya: FormState, formData: FormData): Promise<FormState> {
  const pengajuanId = formData.get("pengajuanId");
  return tulis({
    schema: cocokkanNazhirSchema,
    input: { pengajuanId, nazhirId: formData.get("nazhirId") },
    run: (actor, data) => serverRuntime().wakaf.cocokkanNazhir(actor, data),
    disimpan: "Nazhir dicocokkan.",
    path: `/staf/admin-platform/wakaf/${String(pengajuanId)}`,
  });
}
