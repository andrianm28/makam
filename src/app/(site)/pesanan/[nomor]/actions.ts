"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pemesananResource } from "@/domain/identity";
import { DOKUMEN_MAX_BYTES, batalkanSaatDukaSchema, tarikTerencanaSchema, unggahDokumenSchema } from "@/domain/pemesanan";
import { rekeningSchema } from "@/domain/refunds";
import { pemesananMessage } from "@/lib/pemesanan-labels";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

export type DokumenActionState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };
/** The same shape, for the alternative and the cancellation: one form state per screen. */
export type PesananActionState = DokumenActionState;

/** The document types a family may add: a photo of a paper or a scan of it. */
const JENIS_BERKAS = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/**
 * A family adds a document to its own order, at any time (spec, story 30: papers
 * may follow, even after the burial; nothing here waits for a confirmation).
 */
export async function unggahDokumenAction(_previous: DokumenActionState, formData: FormData): Promise<DokumenActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const file = formData.get("berkas");
  const nama = String(formData.get("nama") ?? "");

  const result = await guarded({
    action: "pemesanan.unggah_dokumen",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: unggahDokumenSchema,
    input: {
      nomor,
      nama,
      file:
        file instanceof File && file.size > 0
          ? { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type }
          : { body: new Uint8Array(), contentType: "" },
    },
    run: async (actor, data) => {
      const pemesanan = serverRuntime().pemesanan;
      // The order is the caller's own: the account that placed it.
      const email = actor.email;
      return pemesanan.unggahDokumen({ accountId: actor.accountId, email }, data);
    },
  });
  if (!result.ok) {
    // A session that ended while the family was choosing a file says so in the family's
    // own words; every other guard refusal is the module's, and it speaks for itself.
    if (result.error === "belum_masuk") return { status: "gagal", message: "Silakan masuk lagi untuk mengunggah dokumen." };
    return { status: "gagal", message: pemesananMessage(result.error) };
  }
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: unggahMessage(result.value.reason) };
  return { status: "berhasil", message: `${result.value.nama} diterima. Terima kasih.` };
}

/**
 * The family answers the alternative the Lokasi offered, with one tap (story 31):
 * accept and the order moves on with the new Jenis Makam or day, refuse and the
 * order becomes Ditolak like any other refusal — never a status of its own.
 */
export async function jawabAlternatifAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const terima = formData.get("terima") === "ya";
  const result = await guarded({
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: z.object({ nomor: z.string().trim().min(1) }),
    input: { nomor },
    run: (actor) =>
      serverRuntime().pemesanan[terima ? "terimaAlternatif" : "tolakAlternatif"](
        { accountId: actor.accountId, email: actor.email },
        { nomor },
      ),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: jawabMessage(result.value.reason) };
  return terima
    ? { status: "berhasil", message: "Pilihan lain diterima. Lokasi Mitra mengonfirmasi lagi, dan kabarnya datang ke email Anda." }
    : { status: "berhasil", message: "Pilihan lain ditolak. Tim kami menelepon Anda untuk mencarikan makam yang bisa dilayani." };
}

/** The family cancels its own order (story 34): a reason once it is confirmed, because a plot and a bill are given up. */
export async function batalkanPesananAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: batalkanSaatDukaSchema,
    input: { nomor, alasan: formData.get("alasan") ?? "" },
    run: (actor, data) =>
      serverRuntime().pemesanan.batalkanSaatDuka({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: jawabMessage(result.value.reason) };
  const tagihan = result.value.tagihan;
  return {
    status: "berhasil",
    message:
      tagihan && tagihan.jumlahDikembalikan > 0
        ? `Pesanan dibatalkan. Tagihan ${tagihan.nomorTagihan} dibatalkan dan ${rupiah(tagihan.jumlahDikembalikan)} sedang dikembalikan.`
        : "Pesanan dibatalkan. Tidak ada biaya pembatalan.",
  };
}

/**
 * The Pemesan withdraws its own Pemesanan Terencana before paying (spec, Pemesanan >
 * Terencana; ticket 37): free, any time until the Tagihan is paid. A paid order is not
 * withdrawn but cancelled with a refund under its Syarat, which is another action.
 */
export async function tarikTerencanaAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pemesanan.lihat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: tarikTerencanaSchema,
    input: { nomor },
    run: (actor, data) => serverRuntime().pemesanan.tarikTerencana({ accountId: actor.accountId, email: actor.email }, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: jawabMessage(result.value.reason) };
  return { status: "berhasil", message: "Pesanan dibatalkan. Petak dilepas dan tidak ada yang ditagih." };
}

const REKENING_GAGAL: Record<string, string> = {
  tidak_ditemukan: "Tidak ada pengembalian dana yang menunggu rekening untuk pesanan ini.",
  terkunci: "Pengembalian dana ini sudah disetujui, jadi rekening tidak bisa diubah di sini. Hubungi CS bila perlu mengubahnya.",
  sudah_ditransfer: "Pengembalian dana ini sudah ditransfer.",
  input_tidak_valid: "Periksa lagi isian rekening Anda.",
};

/** The family enters where the refund on its own order goes, until Admin Platform approves it (ticket 31). */
export async function isiRekeningPengembalianAction(_previous: PesananActionState, formData: FormData): Promise<PesananActionState> {
  const nomor = String(formData.get("nomor") ?? "");
  const result = await guarded({
    action: "pengembalian.isi_rekening",
    resource: (actor) => pemesananResource(actor.accountId),
    schema: z.object({ nomorPemesanan: z.string(), rekening: rekeningSchema }),
    input: {
      nomorPemesanan: nomor,
      rekening: { bank: formData.get("bank"), nomor: formData.get("nomorRekening"), nama: formData.get("nama") },
    },
    run: (actor, data) => serverRuntime().refunds.isiRekeningPemesan(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  revalidatePath(`/pesanan/${nomor}`);
  if (!result.value.ok) return { status: "gagal", message: REKENING_GAGAL[result.value.reason] ?? "Rekening gagal disimpan." };
  return { status: "berhasil", message: "Rekening tersimpan. Kami akan mentransfer pengembalian dana ke rekening ini." };
}

/** A guard refusal in the family's words: a session that ended says so, the rest is the module's. */
function guardMessage(error: string): string {
  if (error === "belum_masuk") return "Silakan masuk lagi untuk melanjutkan.";
  return pemesananMessage(error as Parameters<typeof pemesananMessage>[0]);
}

function rupiah(jumlah: number): string {
  return `Rp ${jumlah.toLocaleString("id-ID")}`;
}

/** What a refusal from the module's own exits says, in the family's words. */
function jawabMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return "Pesanan ini tidak ditemukan.";
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah ditutup, jadi tidak bisa diubah lagi.";
    case "tidak_ada_alternatif":
      return "Tidak ada pilihan lain yang menunggu jawaban Anda untuk pesanan ini.";
    case "harga_tidak_tersedia":
      return "Harga pilihan itu sudah berubah atau belum tersedia. Hubungi kami lewat nomor CS.";
    case "alasan_wajib":
      return "Tulis alasan pembatalan dulu.";
    case "sudah_dibayar":
      return "Tagihan pesanan ini sudah dibayar, jadi tidak bisa ditarik lagi. Hubungi Lokasi Mitra untuk pembatalan sesuai Syarat Pemesanan.";
    case "pemakaman_sudah_dicatat":
      return "Pemakaman sudah dilakukan, jadi petak tidak bisa dikembalikan. Hubungi Lokasi Mitra untuk SHO dan pemindahan jenazah.";
    case "hak_pakai_tidak_ditemukan":
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai pesanan ini sudah berakhir, jadi tidak ada yang bisa dikembalikan.";
    default:
      return "Permintaan ini belum bisa diproses. Periksa lagi sebentar.";
  }
}

function unggahMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return "Pesanan ini tidak ditemukan.";
    case "dokumen_tidak_dikenal":
      return "Pilih dokumen dari daftar yang Lokasi Mitra minta.";
    case "berkas_kosong":
      return "Pilih berkas lebih dulu.";
    case "berkas_tidak_didukung":
      return `Berkas harus foto (JPG, PNG, WEBP) atau PDF, maksimal ${Math.round(DOKUMEN_MAX_BYTES / (1024 * 1024))} MB.`;
    case "penyimpanan_belum_tersedia":
      return "Penyimpanan belum tersedia. Bawa dokumennya langsung pada hari pemakaman.";
    default:
      return "Dokumen belum bisa diunggah.";
  }
}
