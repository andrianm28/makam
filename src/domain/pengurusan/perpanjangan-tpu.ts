/**
 * Perpanjangan TPU, the IPTM renewal of a Makam TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48).
 * The order runs Diajukan -> (Perlu Perbaikan) -> Menunggu Pembayaran -> Diproses -> IPTM Diajukan -> IPTM Terbit,
 * plus Ditolak and Dibatalkan, pay-first after the document check like the filing-only Pengurusan IPTM; the steps they
 * share (uploads, the check, the Tagihan, filing, PTSP rejections, IPTM Terbit) live in `pengajuan-iptm.ts` and
 * `pengurusan-berkas.ts`. This file holds the order's placing and what is particular to a renewal.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pengurusanTpuResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap } from "@/domain/billing";
import { addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import { BULAN_MASA_TENGGANG_TPU, BULAN_PERPANJANGAN_TPU_DIBUKA, menungguPemeriksaan } from "./aturan";
import { daftarDokumenPerpanjangan } from "./dokumen";
import type { Pemesan, PengurusanDeps } from "./deps";
import { kembalikanKePerbaikan } from "./pengurusan-berkas";
import { pengurusanTpu, makamTpu } from "./schema";

export interface PlacePerpanjanganTpuInput {
  pemesan: Pemesan;
  pemesanName: string;
  phoneNumber: string;
  /** The Makam TPU whose IPTM is renewed; it must be the Pemesan's own. */
  makamTpuId: string;
  /** The IPTM's expiry date, `YYYY-MM-DD`, read off the IPTM photo. */
  berlakuSampai: string;
}

export type PlacePerpanjanganTpuResult =
  | { ok: true; pengurusan: { nomor: string; status: "diajukan"; lewatMasaTenggang: boolean } }
  | { ok: false; reason: "input_tidak_valid" | "makam_tpu_tidak_ditemukan" | "email_bukan_akun_ini" | "terlalu_awal" | "harga_tidak_tersedia" };

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Places a Perpanjangan TPU for the Pemegang Hak of a Makam TPU: Diajukan, its Nomor Pemesanan, the filing documents to upload and no Tagihan. */
export async function placePerpanjanganTpu(deps: PengurusanDeps, input: PlacePerpanjanganTpuInput): Promise<PlacePerpanjanganTpuResult> {
  const now = deps.clock.now();
  const nama = input.pemesanName.trim();
  if (nama === "" || !TANGGAL.test(input.berlakuSampai) || Number.isNaN(Date.parse(input.berlakuSampai))) return { ok: false, reason: "input_tidak_valid" };
  const akun = await deps.identity.accountByEmail(input.pemesan.email);
  if (!akun || akun.id !== input.pemesan.accountId) return { ok: false, reason: "email_bukan_akun_ini" };
  const [makam] = await deps.db.select().from(makamTpu).where(eq(makamTpu.id, input.makamTpuId));
  if (!makam || makam.pemegangAccountId !== akun.id) return { ok: false, reason: "makam_tpu_tidak_ditemukan" };

  const hariIni = wibDateOf(now);
  if (hariIni < addWibDateMonths(input.berlakuSampai, -BULAN_PERPANJANGAN_TPU_DIBUKA)) return { ok: false, reason: "terlalu_awal" };
  const lewatMasaTenggang = hariIni > addWibDateMonths(input.berlakuSampai, BULAN_MASA_TENGGANG_TPU);

  const dikutip = await deps.tariffs.quote(
    [
      { kind: "biaya_pengurusan", pengurusan: "berkas" },
      { kind: "retribusi_pemda", retribusi: "iptm" },
    ],
    now,
  );
  if (!dikutip.ok || !withinPaymentCap(dikutip.total)) return { ok: false, reason: "harga_tidak_tersedia" };
  const tpu = await deps.lokasi.publicTpuDki(makam.tpuId);
  const almarhum = makam.almarhum[0]!;
  const dokumen = daftarDokumenPerpanjangan();

  return refusable(deps.db, async (tx) => {
    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    await tx.insert(pengurusanTpu).values({
      nomor,
      kind: "perpanjangan_tpu",
      status: "diajukan",
      tpuId: makam.tpuId,
      tpuName: makam.tpuName,
      tpuAddress: tpu?.address ?? "",
      pemesanAccountId: akun.id,
      pemesanName: nama,
      email: akun.email,
      phoneNumber: input.phoneNumber.trim() || null,
      almarhumName: almarhum.name,
      tanggalWafat: almarhum.tanggalWafat || hariIni,
      jenisPenguburan: "tumpang",
      kelayakan: { ktpDki: true, wafatDiJakarta: true },
      kuburan: { blokNomor: makam.blokNomor, nama: almarhum.name },
      pemegangHak: makam.pemegangHak,
      dokumenPemakaman: dokumen.pemakaman,
      dokumenPengajuan: dokumen.pengajuan,
      diajukanAt: now,
      makamTpuId: makam.id,
      iptmBerakhirPada: input.berlakuSampai,
      lewatMasaTenggang,
    });
    return { ok: true as const, pengurusan: { nomor, status: "diajukan" as const, lewatMasaTenggang } };
  });
}

export const mintaPerbaikanSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** What is wrong, in words the Pemegang Hak can act on. */
  alasan: z.string().trim().min(1).max(500),
  /** The checklist documents to upload again. */
  dokumen: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
});

export type MintaPerbaikanResult =
  | { ok: true; status: "perlu_perbaikan" }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pengurusan_tidak_ditemukan" | "status_tidak_sesuai" | "dokumen_tidak_dikenal" };

/**
 * Admin Platform's document check finds one that needs fixing, before any Tagihan: the order goes to Perlu Perbaikan, the
 * documents named are cleared for a new upload, and the check runs again once they are in. Audited.
 */
export async function mintaPerbaikan(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<MintaPerbaikanResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = mintaPerbaikanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, parsed.data.nomor));
  if (!order || order.kind !== "perpanjangan_tpu") return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (!menungguPemeriksaan(order)) return { ok: false, reason: "status_tidak_sesuai" };
  return kembalikanKePerbaikan(deps, by, order, { aksi: "pengurusan.perbaikan_diminta", alasan: parsed.data.alasan, dokumen: parsed.data.dokumen });
}
