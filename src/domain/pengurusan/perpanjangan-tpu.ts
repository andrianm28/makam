/**
 * Perpanjangan TPU, the IPTM renewal of a Makam TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48).
 * The order runs Diajukan -> (Perlu Perbaikan) -> Menunggu Pembayaran -> Diproses -> IPTM Diajukan -> IPTM Terbit,
 * plus Ditolak and Dibatalkan, pay-first after the document check like the filing-only Pengurusan IPTM; the steps they
 * share (uploads, the check, the Tagihan, filing, PTSP rejections, IPTM Terbit) live in `pengajuan-iptm.ts` and
 * `pengurusan-berkas.ts`. This file holds the order's placing and what is particular to a renewal.
 */
import { eq } from "drizzle-orm";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap } from "@/domain/billing";
import { addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import { BULAN_MASA_TENGGANG_TPU, BULAN_PERPANJANGAN_TPU_DIBUKA } from "./aturan";
import { daftarDokumenPerpanjangan } from "./dokumen";
import type { Pemesan, PengurusanDeps } from "./deps";
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
