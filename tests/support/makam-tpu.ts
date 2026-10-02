import type { PengajuanSetup } from "./pengurusan";
import { fotoIptm, kuburanTumpang, pemesanDenganEmail, tpu } from "./pengurusan";
import { siapkanOperatorPemesanan } from "./pemesanan";
import { wib } from "@/lib/time/jakarta";

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;

/**
 * A family's Makam TPU on record, brought there through the real filing-only Pengurusan IPTM (placed, checked, paid, filed,
 * IPTM Terbit with `berlakuSampai`), the way one gets there in production; the clock ends at 2 October 2026 18:00 WIB.
 * The tariffs a Perpanjangan TPU is priced from are set here too.
 */
export async function makamTpuDenganIptm(setup: PengajuanSetup, berlakuSampai: string) {
  const admin = await siapkanOperatorPemesanan(setup as never);
  setup.clock.set(wib("2026-10-01 10:00"));
  const masuk = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await masuk("biaya_pengurusan_pemakaman", 1_750_000);
  await masuk("biaya_pengurusan_berkas", 750_000);
  await masuk("retribusi_pemda_iptm", 250_000);
  await masuk("biaya_layanan_platform", 150_001);
  const tpuDki = await tpu(setup);
  const pemesan = (await pemesanDenganEmail(setup, "pemegang@contoh.id")).pemesan;
  setup.clock.set(wib("2026-10-02 10:00"));
  const placed = await setup.pengurusan.placePengurusanIptm({
    pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    tpuId: tpuDki.id,
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-25",
    jenis: "tumpang",
    kuburan: kuburanTumpang(),
    fotoIptm: fotoIptm(),
    kelayakan: { ktpDki: true, wafatDiJakarta: true },
    pemegangHak: { mode: "pemesan" },
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const nomor = placed.pengurusan.nomor;
  setup.clock.set(wib("2026-10-02 14:00"));
  const order = await setup.pengurusan.orderOf(nomor, pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
  const lengkap = await setup.pengurusan.periksaDokumen(admin, { nomor });
  if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(lengkap)}`);
  const dibayar = await setup.billing.recordPayment(lengkap.tagihan.id, QRIS);
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  await setup.pengurusan.pembayaranBerkasTick();
  const diajukan = await setup.pengurusan.ajukanIptm(admin, { nomor });
  if (!diajukan.ok) throw new Error(`filing refused: ${diajukan.reason}`);
  setup.clock.set(wib("2026-10-02 18:00"));
  const terbit = await setup.pengurusan.terbitkanIptm(admin, { nomor, berkas: berkas(), berlakuSampai });
  if (!terbit.ok) throw new Error(`IPTM Terbit refused: ${terbit.reason}`);
  return { admin, pemesan, tpuDki, makamTpuId: terbit.makamTpuId };
}
