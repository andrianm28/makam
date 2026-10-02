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
    expect(placed).toMatchObject({ ok: true, konsen: { state: "implisit" } });

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

  it("emails the Pemegang Hak a plain link, with no code, and Setujui under Perlu tindakan lets the Lokasi confirm", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const { pemesan: pemegang } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    expect(placed).toMatchObject({ ok: true, konsen: { state: "menunggu_pemegang" } });
    expect(placed).not.toHaveProperty("kode");
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;
    // Notifications is asked to email the holder at the recorded address; the request carries no secret.
    expect(setup.tumpangMinta).toMatchObject([{ nomor, email: "pemegang@contoh.id", pemegangHakName: "Siti Aminah" }]);
    expect(Object.keys(setup.tumpangMinta[0]!).sort()).toEqual(["almarhum", "email", "lokasi", "nomor", "pemegangHakName", "pemesanName", "pemesananId"]);

    // The Lokasi cannot confirm before the holder answered.
    expect(await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" })).toEqual({ ok: false, reason: "konsen_belum_selesai" });

    // The request sits under Perlu tindakan of the holder's own Akun only.
    expect(await setup.pemesanan.konsenMenungguSaya({ accountId: pemesan.accountId })).toEqual([]);
    expect(await setup.pemesanan.konsenMenungguSaya({ accountId: pemegang.accountId })).toMatchObject([{ nomor, almarhumName: "Budi Santoso", pemesanName: "Rina Wulandari" }]);

    // Another Akun cannot answer for the holder.
    expect(await setup.pemesanan.jawabKonsenTumpang(pemesan, { nomor, jawaban: "setuju" })).toEqual({ ok: false, reason: "bukan_pemegang_hak" });
    expect(await setup.pemesanan.jawabKonsenTumpang(pemegang, { nomor, jawaban: "setuju" })).toMatchObject({ ok: true, pesanan: { status: "diajukan" } });
    // A consent already given cannot be given twice, and the strip clears.
    expect(await setup.pemesanan.jawabKonsenTumpang(pemegang, { nomor, jawaban: "tolak" })).toEqual({ ok: false, reason: "konsen_sudah_diputuskan" });
    expect(await setup.pemesanan.konsenMenungguSaya({ accountId: pemegang.accountId })).toEqual([]);
    expect((await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor, pemakamanAt: "2026-10-02T10:00" })).ok).toBe(true);
  });

  it("makes the order Ditolak with \"Pemegang Hak tidak menyetujui\" when the Pemegang Hak answers Tolak", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const { pemesan: pemegang } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    const nomor = (placed as { pesanan: { nomor: string } }).pesanan.nomor;
    expect(await setup.pemesanan.jawabKonsenTumpang(pemegang, { nomor, jawaban: "tolak" })).toMatchObject({ ok: true, pesanan: { status: "ditolak" } });
    expect(await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, nomor)).toMatchObject({ status: "ditolak", alasan: "Pemegang Hak tidak menyetujui" });
    expect(await setup.pemesanan.konsenMenungguSaya({ accountId: pemegang.accountId })).toEqual([]);
  });

  it("waits for the Admin Lokasi to log verbal consent or an heirship proof when the holder has no recorded email", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001" });

    const placed = await ajukan(setup, lokasi, hakPakaiId, pemesan);
    expect(placed).toMatchObject({ ok: true, konsen: { state: "menunggu_lokasi" } });
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

  it("raises a Ganti Pemegang Hak reminder for the Admin Lokasi when consent is an heirship proof, and none for a verbal one", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001" });
    const satu = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    const dua = (await ajukan(setup, lokasi, hakPakaiId, pemesan, "Almarhum Lain")) as { pesanan: { nomor: string } };

    await setup.pemesanan.catatKonsenTumpang(lokasi.adminLokasi, { nomor: satu.pesanan.nomor, via: "verbal", catatan: "Lewat telepon." });
    await setup.pemesanan.catatKonsenTumpang(lokasi.adminLokasi, { nomor: dua.pesanan.nomor, via: "ahli_waris", catatan: "Surat keterangan waris dibawa keluarga." });
    expect((await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, satu.pesanan.nomor))?.tumpang).toMatchObject({ konsen: { state: "disetujui", via: "verbal" }, gantiPemegangHakDiingatkan: false });
    expect((await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, dua.pesanan.nomor))?.tumpang).toMatchObject({ konsen: { state: "disetujui", via: "ahli_waris" }, gantiPemegangHakDiingatkan: true });
  });

  it("shows the Admin Lokasi the tumpang checks and a warning for an earlier Tagihan still unpaid", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    const pertama = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor: pertama.pesanan.nomor, pemakamanAt: "2026-10-02T10:00" });
    const kedua = (await ajukan(setup, lokasi, hakPakaiId, pemesan, "Almarhum Lain")) as { pesanan: { nomor: string } };

    const staf = await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, kedua.pesanan.nomor);
    expect(staf?.tumpang).toMatchObject({ pemeriksaan: { ok: true }, tagihanSebelumnyaBelumLunas: [{ nomorPesanan: pertama.pesanan.nomor }] });
  });

  it("offers a released but not cleared plot only as tumpang, and only when the Lokasi allows it on released plots", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi, { minYears: 0 });
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    await setup.inventory.catatPemakaman(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId, almarhumName: "Almarhum Pertama", tanggal: "2026-01-15" });
    const akhir = await setup.inventory.akhiriHakPakaiManual(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId, alasan: "Masa berakhir" });
    expect(akhir.ok).toBe(true);

    const placed = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    // The Lokasi allows tumpang but not on released plots: refused with its own reason.
    expect(await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor: placed.pesanan.nomor, pemakamanAt: "2026-10-02T10:00" })).toEqual({ ok: false, reason: "tumpang_petak_dilepas_tidak_diizinkan" });
    // Never offered as an empty plot: the Pemesan cannot take it as a new plot.
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))?.released).toBe(true);
  });

  it("buries in a chosen member Petak of a Kavling Keluarga without creating a Hak Pakai, the next plot not being a tumpang", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    await siapkanOperatorPemesanan(setup);
    const fixture = await terencanaLokasi(setup, admin, { masaPembatalanDays: 30 });
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const kavling = (await setup.inventory.publicDenah(fixture.lokasiMitra.id))!.bloks.flatMap((blok) => blok.kavling)[0]!;
    const placed = await setup.pemesanan.placeTerencana({
      pemesan,
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      lokasiId: fixture.lokasiMitra.id,
      units: [{ kavlingId: kavling.id }],
    });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasiTerencana refused");
    await setup.billing.recordPayment(konfirmasi.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    const hakPakaiId = (await setup.pemesanan.terencanaUntukStaf(admin, placed.pemesanan.nomor))!.unit[0]!.hakPakaiId!;
    const hak = await setup.inventory.hakPakaiUntukTumpang(hakPakaiId);
    const anggota = hak!.kavling!.petak;
    expect(anggota.length).toBeGreaterThanOrEqual(2);

    // The Kavling needs a member Petak named; an outside one is refused.
    const input = { pemesanAccountId: pemesan.accountId, pemesanEmail: pemesan.email, pemesanName: "Rina Wulandari", phoneNumber: "081234567890", lokasiId: fixture.lokasiMitra.id, hakPakaiId, jenis: "kavling_berikutnya" as const, almarhumName: "Budi Santoso", tanggalWafat: "2026-09-30" };
    expect(await setup.pemesanan.ajukanTumpang(input)).toEqual({ ok: false, reason: "petak_tidak_ditemukan" });
    const diajukan = await setup.pemesanan.ajukanTumpang({ ...input, petakId: anggota[1]!.id });
    if (!diajukan.ok) throw new Error(`ajukanTumpang refused: ${diajukan.reason}`);
    const nomor = diajukan.pesanan.nomor;
    // The Pemesan is the holder here, so consent is implicit; no tumpang policy applies to an unused plot.
    expect(diajukan.konsen.state).toBe("implisit");
    const dikonfirmasi = await setup.pemesanan.konfirmasiTumpang(fixture.adminLokasi, { nomor, pemakamanAt: "2026-10-03T10:00" });
    if (!dikonfirmasi.ok) throw new Error(`konfirmasiTumpang refused: ${dikonfirmasi.reason}`);
    setup.clock.set(wib("2026-10-03 11:00"));
    expect(await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor, tanggal: "2026-10-03" })).toMatchObject({ ok: true, pesanan: { petakNomor: anggota[1]!.nomorMakam } });
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))?.layers).toBe(1);
  });

  it("cancelling a further burial cancels only the order and its Tagihan, and never issues a Bukti Pemesanan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    const placed = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    const konfirmasi = await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor: placed.pesanan.nomor, pemakamanAt: "2026-10-02T10:00" });
    expect(konfirmasi.ok).toBe(true);

    const batal = await setup.pemesanan.batalkanUntukPemesan(lokasi.adminLokasi, { nomor: placed.pesanan.nomor, alasan: "Keluarga membatalkan" });
    if (!batal.ok) throw new Error(`batalkan refused: ${batal.reason}`);
    expect(await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, placed.pesanan.nomor)).toMatchObject({ status: "dibatalkan", buktiPemesananId: null });
    // The right itself is untouched.
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))?.status).toBe("aktif");
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
