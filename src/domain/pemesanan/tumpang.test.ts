/**
 * A further burial under an existing Hak Pakai — "Makamkan di sini" (ticket 35).
 * It runs the Saat Duka track without creating a Hak Pakai, resolves the
 * Pemegang Hak's consent before the Lokasi may confirm, and leaves the existing
 * tenure clock alone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { payoutsFor } from "../../../tests/support/payouts";
import {
  pemesananOnTestDatabase,
  pemesanDenganEmail,
  siapkanOperatorPemesanan,
  terverifikasiLokasi,
  unitIds,
  type PemesananSetup,
} from "../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Terverifikasi Lokasi Mitra with Pengaturan Operator entered and cleared Petak, plus a way to read its cells. */
async function lokasiDenganPetak(setup: PemesananSetup) {
  await siapkanOperatorPemesanan(setup);
  const lokasi = await terverifikasiLokasi(setup, { petak: { rows: 1, cols: 3 } });
  const denah = await setup.inventory.asStaff(lokasi.adminLokasi).blok(lokasi.lokasiMitra.id, lokasi.blok!.id);
  const cells = (denah?.cells ?? []).filter((cell) => cell.kind === "petak" && cell.nomorMakam);
  return { lokasi, cells };
}

/** Switches the Lokasi Mitra's tumpang flags on (off by default), keeping its other policies. */
async function izinkanTumpang(setup: PemesananSetup, lokasi: Awaited<ReturnType<typeof lokasiDenganPetak>>["lokasi"], patch: { allowed?: boolean; minYears?: number; maxLayers?: number } = {}) {
  const dibaca = await setup.lokasi.lokasiMitra(lokasi.admin, lokasi.lokasiMitra.id);
  if (!dibaca.ok) throw new Error("Lokasi Mitra not readable");
  const flags = {
    ...dibaca.lokasiMitra.flags,
    tumpang: { allowed: patch.allowed ?? true, minYears: patch.minYears ?? 3, maxLayers: patch.maxLayers ?? 3 },
  };
  const hasil = await setup.lokasi.setPoliciesAndFlags(lokasi.admin, lokasi.lokasiMitra.id, { policies: dibaca.lokasiMitra.policies, flags });
  if (!hasil.ok) throw new Error("flags refused");
}

/** An Aktif Hak Pakai for one cleared Petak, with the holder's own contact. */
async function beriHakPakai(setup: PemesananSetup, lokasi: Awaited<ReturnType<typeof lokasiDenganPetak>>["lokasi"], petakId: string, pemegangHak: { name: string; phoneNumber: string; email?: string }) {
  const hasil = await setup.inventory.beriHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, {
    petakId,
    jenisMakamId: lokasi.jenisMakam.id,
    pemegangHak,
  });
  if (!hasil.ok) throw new Error(`Hak Pakai refused: ${hasil.reason}`);
  return hasil.hakPakaiId;
}

/** The tumpang request the hub's "Makamkan di sini" sends. */
function ajukan(
  setup: PemesananSetup,
  lokasi: { lokasiMitra: { id: string } },
  hakPakaiId: string,
  pemesan: { accountId: string; email: string },
  almarhumName = "Budi Santoso",
) {
  return setup.pemesanan.ajukanTumpang({
    pemesanAccountId: pemesan.accountId,
    pemesanEmail: pemesan.email,
    pemesanName: "Rina Wulandari",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    hakPakaiId,
    jenis: "tumpang",
    almarhumName,
    tanggalWafat: "2026-09-30",
    rencanaPemakamanAt: "2026-10-02T10:00",
  });
}

describe("Makamkan di sini", () => {
  it("is implicit for the Akun whose Email Terverifikasi is the holder's, and confirming issues the pay-after Tagihan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    expect(placed).toMatchObject({ ok: true, konsen: { state: "implisit", email: null }, kode: null });

    const konfirmasi = await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor: (placed as { pesanan: { nomor: string } }).pesanan.nomor, pemakamanAt: "2026-10-02T10:00" });
    expect(konfirmasi).toMatchObject({ ok: true, pesanan: { status: "dikonfirmasi", hakPakaiId }, tagihan: { total: 2_150_000 } });

    // Recording the burial adds it to the right that already exists.
    setup.clock.set(wib("2026-10-02 11:00"));
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;
    const dicatat = await setup.pemesanan.catatPemakaman(lokasi.adminLokasi, { nomor, tanggal: "2026-10-02" });
    expect(dicatat).toMatchObject({ ok: true, pesanan: { status: "dimakamkan" }, buktiPemesananNomor: null });
    const hak = await setup.inventory.hakPakaiById(hakPakaiId);
    expect(hak?.tenureStartAt?.toISOString().slice(0, 10)).toBe("2026-10-02");

    // Paid after the burial, a further burial reaches Selesai without a Bukti Pemesanan.
    const tagihanId = (konfirmasi as { tagihan: { id: string } }).tagihan.id;
    const dibayar = await setup.billing.recordPayment(tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    expect(dibayar.ok).toBe(true);
    const staf = await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, nomor);
    expect(staf).toMatchObject({ status: "selesai", buktiPemesananId: null });
  });

  it("sends a code to the holder's recorded email, accepts Setujui, and Tolak ends the order with its fixed reason", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    expect(placed).toMatchObject({ ok: true, konsen: { state: "menunggu_email", email: "pemegang@contoh.id" } });
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;
    const kode = (placed as { kode: string }).kode;
    expect(kode).toMatch(/^\d{6}$/);

    expect(await setup.pemesanan.setujuiTumpang({ nomor, kode: "000000" })).toEqual({ ok: false, reason: "kode_salah" });
    expect(await setup.pemesanan.setujuiTumpang({ nomor, kode })).toMatchObject({ ok: true, pesanan: { status: "diajukan" } });
    // A consent already given cannot be given twice.
    expect(await setup.pemesanan.setujuiTumpang({ nomor, kode })).toEqual({ ok: false, reason: "konsen_sudah_diputuskan" });

    // A second order the holder declines: the order is Ditolak with the fixed reason.
    const kedua = await ajukan(setup, lokasi, hakPakaiId, pemesan, "Almarhum Lain");
    const nomorKedua = (kedua as { pesanan: { nomor: string } }).pesanan.nomor;
    expect(await setup.pemesanan.tolakTumpang({ nomor: nomorKedua, kode: (kedua as { kode: string }).kode })).toMatchObject({ ok: true, pesanan: { status: "ditolak" } });
    expect(await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, nomorKedua)).toMatchObject({ status: "ditolak", alasan: "Pemegang Hak tidak menyetujui" });
  });

  it("waits for the Admin Lokasi to log verbal consent or an heirship proof when the holder has no recorded email", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    expect(placed).toMatchObject({ ok: true, konsen: { state: "menunggu_lokasi" }, kode: null });
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;

    expect(await setup.pemesanan.catatKonsenTumpang(lokasi.adminLokasi, { nomor, via: "verbal", catatan: "Pemegang Hak menyetujui lewat telepon." })).toMatchObject({ ok: true });
    // Settled, so the confirmation can now take it.
    const konfirmasi = await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" });
    expect(konfirmasi.ok).toBe(true);
  });

  it("blocks confirmation with the reason when the tumpang policy fails, and offers a released plot only as tumpang", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    // Someone is already buried there, a fortnight ago.
    await setup.inventory.catatPemakaman(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId, almarhumName: "Almarhum Pertama", tanggal: "2026-09-15" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;
    // The minimum years since the last burial have not passed.
    expect(await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" })).toEqual({ ok: false, reason: "masa_tunggu_belum_lewat" });
    // The Lokasi does not allow tumpang at all.
    await izinkanTumpang(setup, lokasi, { allowed: false });
    expect(await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" })).toEqual({ ok: false, reason: "tumpang_tidak_diizinkan" });
    // Every layer is taken: a second burial fills the plot (the Lokasi's own rules keep maxLayers at 2 or more).
    await setup.inventory.catatPemakaman(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId, almarhumName: "Almarhum Kedua", tanggal: "2026-09-20" });
    await izinkanTumpang(setup, lokasi, { minYears: 0, maxLayers: 2 });
    expect(await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" })).toEqual({ ok: false, reason: "lapisan_penuh" });
  });

  it("tells Payouts when a burial happens in a Pemesanan Terencana's plot, so its Pencairan is due at the first Pemakaman", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    await siapkanOperatorPemesanan(setup);
    const fixture = await terencanaLokasi(setup, admin, { masaPembatalanDays: 30 });
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const id = await unitIds(setup, fixture, ["A-01"]);
    const placed = await setup.pemesanan.placeTerencana({
      pemesan,
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: id["A-01"]! }],
    });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasiTerencana refused");
    const bayar = await setup.billing.recordPayment(konfirmasi.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    expect(bayar.ok).toBe(true);

    const staf = await setup.pemesanan.terencanaUntukStaf(admin, placed.pemesanan.nomor);
    const hakPakaiId = staf!.unit[0]!.hakPakaiId!;
    expect(hakPakaiId).toBeTruthy();

    const tumpang = await ajukan(setup, fixture, hakPakaiId, pemesan);
    if (!tumpang.ok) throw new Error(`ajukanTumpang refused: ${tumpang.reason}`);
    const konfirmasiTumpang = await setup.pemesanan.konfirmasiTumpang(fixture.adminLokasi, { nomor: tumpang.pesanan.nomor, pemakamanAt: "2026-10-03T10:00" });
    expect(konfirmasiTumpang.ok).toBe(true);

    setup.clock.set(wib("2026-10-03 11:00"));
    const pemakamanPada = setup.clock.now();
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: tumpang.pesanan.nomor, tanggal: "2026-10-03" });
    expect(dicatat.ok).toBe(true);

    const { payouts } = payoutsFor(setup);
    // Without the burial half written for the Terencana order, nothing would be
    // due until the Masa Pembatalan ended 30 days after payment.
    expect(await payouts.tick()).toMatchObject({ items: 1 });
    const [baris] = await payouts.pencairanJatuhTempo();
    expect(baris).toMatchObject({ amount: 2_500_000, jatuhTempoAt: await payouts.tenggat(pemakamanPada) });
  });
});
