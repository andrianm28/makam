/**
 * A further burial under an existing Hak Pakai — "Makamkan di sini" (ticket 35).
 * It runs the Saat Duka track without creating a Hak Pakai, resolves the
 * Pemegang Hak's consent before the Lokasi may confirm, and leaves the existing
 * tenure clock alone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { tagihan as tagihanTable } from "@/domain/billing/schema";
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
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId, anggota[1]!.id))?.layers).toBe(1);
  });

  it("counts a tumpang's layers and last burial for the target Petak, not for every Petak of the Kavling Keluarga", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    await siapkanOperatorPemesanan(setup);
    const fixture = await terencanaLokasi(setup, admin, { masaPembatalanDays: 30 });
    await izinkanTumpang(setup, { ...fixture, admin } as never, { minYears: 3, maxLayers: 3 });
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
    const [petakA, petakB] = (await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))!.kavling!.petak;
    // Petak A was used a fortnight ago; Petak B's only burial is long past the minimum years.
    await setup.inventory.catatPemakaman(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, petakId: petakA!.id, almarhumName: "Almarhum A", tanggal: "2026-09-15" });
    await setup.inventory.catatPemakaman(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, petakId: petakB!.id, almarhumName: "Almarhum B", tanggal: "2020-01-01" });

    const minta = async (petakId: string, almarhumName: string) => {
      const diajukan = await setup.pemesanan.ajukanTumpang({
        pemesanAccountId: pemesan.accountId, pemesanEmail: pemesan.email, pemesanName: "Rina Wulandari", phoneNumber: "081234567890",
        lokasiId: fixture.lokasiMitra.id, hakPakaiId, petakId, jenis: "tumpang", almarhumName, tanggalWafat: "2026-09-30",
      });
      if (!diajukan.ok) throw new Error(`ajukanTumpang refused: ${diajukan.reason}`);
      return diajukan.pesanan.nomor;
    };
    const nomorA = await minta(petakA!.id, "Tumpang di A");
    const nomorB = await minta(petakB!.id, "Tumpang di B");
    expect(await setup.pemesanan.konfirmasiTumpang(fixture.adminLokasi, { nomor: nomorA, pemakamanAt: "2026-10-03T10:00" })).toEqual({ ok: false, reason: "masa_tunggu_belum_lewat" });
    expect((await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, nomorA))?.tumpang?.pemeriksaan).toEqual({ ok: false, reason: "masa_tunggu_belum_lewat" });
    expect((await setup.pemesanan.konfirmasiTumpang(fixture.adminLokasi, { nomor: nomorB, pemakamanAt: "2026-10-03T10:00" })).ok).toBe(true);
    // The tumpang is laid one layer above what Petak B itself holds.
    setup.clock.set(wib("2026-10-03 11:00"));
    expect(await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: nomorB, tanggal: "2026-10-03" })).toMatchObject({ ok: true, pemakaman: { layer: 2 } });
  });

  it("alerts the Lokasi's Admin Lokasi (bell and email, a Peringatan Staf) when an heirship proof is logged, and not for a verbal consent", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001" });
    const satu = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    const dua = (await ajukan(setup, lokasi, hakPakaiId, pemesan, "Almarhum Lain")) as { pesanan: { nomor: string } };
    const peringatan = async () => {
      await setup.notifications.kirimPeringatanStafTick();
      return (await setup.notifications.pesanStaf(lokasi.adminLokasi.accountId)).filter((pesan) => pesan.template === "staf_ganti_pemegang_hak");
    };

    await setup.pemesanan.catatKonsenTumpang(lokasi.adminLokasi, { nomor: satu.pesanan.nomor, via: "verbal", catatan: "Lewat telepon." });
    expect(await peringatan()).toEqual([]);

    await setup.pemesanan.catatKonsenTumpang(lokasi.adminLokasi, { nomor: dua.pesanan.nomor, via: "ahli_waris", catatan: "Surat waris." });
    const pesan = await peringatan();
    expect(pesan.map((satu) => satu.channel)).toContain("email");
    expect(pesan.find((satu) => satu.channel === "email")?.subject).toContain(dua.pesanan.nomor);
    expect(JSON.stringify(await setup.notifications.staffAlerts(lokasi.adminLokasi))).toContain(`/staf/admin-lokasi/${lokasi.lokasiMitra.id}/pesanan/${dua.pesanan.nomor}`);
  });

  it("lets the Admin Lokasi Tolak a further burial with a reason off the fixed Saat Duka list, leaving the Hak Pakai whole", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const { pemesan: pemegang } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    const placed = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };

    const hasil = await setup.pemesanan.tolakSaatDuka(lokasi.adminLokasi, { nomor: placed.pesanan.nomor, alasan: "di_luar_wilayah" });
    expect(hasil).toMatchObject({ ok: true, pesanan: { status: "ditolak" } });
    expect(await setup.pemesanan.orderUntukStaf(lokasi.adminLokasi, placed.pesanan.nomor)).toMatchObject({ status: "ditolak", alasan: "Di luar wilayah pelayanan Lokasi Mitra ini" });
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))?.status).toBe("aktif");
    // The holder's pending request leaves Perlu tindakan with it.
    expect(await setup.pemesanan.konsenMenungguSaya({ accountId: pemegang.accountId })).toEqual([]);
  });

  it("tells the family a refused further burial is not the Saat Duka wording: the Lokasi's contact, nothing due, no Pilih makam, and no rebook", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const { pemesan: pemegang } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    const oleh = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    const olehHolder = (await ajukan(setup, lokasi, hakPakaiId, pemesan, "Almarhum Lain")) as { pesanan: { nomor: string } };

    await setup.pemesanan.tolakSaatDuka(lokasi.adminLokasi, { nomor: oleh.pesanan.nomor, alasan: "di_luar_wilayah" });
    await setup.pemesanan.jawabKonsenTumpang(pemegang, { nomor: olehHolder.pesanan.nomor, jawaban: "tolak" });

    // Neither refusal goes through the Saat Duka "Pilih makam lain" announcement.
    expect(setup.ditolak).toEqual([]);
    expect(setup.tumpangDitolak.map((satu) => satu.nomor).sort()).toEqual([oleh.pesanan.nomor, olehHolder.pesanan.nomor].sort());
    expect(setup.tumpangDitolak.find((satu) => satu.nomor === oleh.pesanan.nomor)).toMatchObject({ alasan: "Di luar wilayah pelayanan Lokasi Mitra ini", email: "keluarga@contoh.id" });
    expect(setup.tumpangDitolak.find((satu) => satu.nomor === olehHolder.pesanan.nomor)).toMatchObject({ alasan: "Pemegang Hak tidak menyetujui" });
    // The order page offers no "Pilih makam lain" for it.
    expect(await setup.pemesanan.rebook(oleh.pesanan.nomor, pemesan)).toBeNull();
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

  it("never lets Tidak Tertagih on a further burial's Tagihan end the Hak Pakai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "pemegang@contoh.id", "Siti Aminah");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
    const placed = (await ajukan(setup, lokasi, hakPakaiId, pemesan)) as { pesanan: { nomor: string } };
    const konfirmasi = await setup.pemesanan.konfirmasiTumpang(lokasi.adminLokasi, { nomor: placed.pesanan.nomor, pemakamanAt: "2026-10-02T10:00" });
    if (!konfirmasi.ok) throw new Error(`konfirmasiTumpang refused: ${konfirmasi.reason}`);

    // The overdue list offers "Akhiri Hak Pakai" only for a Saat Duka grant's own Tagihan: this one offers none.
    expect(await setup.pemesanan.hakPakaiIdForTagihan(konfirmasi.tagihan.id)).toBeNull();
    // Even with the Tagihan Tidak Tertagih, ending the Hak Pakai that way is refused and the right stays Aktif.
    await db.update(tagihanTable).set({ status: "tidak_tertagih" }).where(eq(tagihanTable.id, konfirmasi.tagihan.id));
    expect(await setup.pemesanan.akhiriHakPakaiTidakTertagih(lokasi.adminLokasi, { hakPakaiId })).toMatchObject({ ok: false });
    expect((await setup.inventory.hakPakaiUntukTumpang(hakPakaiId))?.status).toBe("aktif");
    // And it blocks nothing: the Perpanjangan / Ganti Pemegang Hak block reads the grant's own Tagihan only.
    expect(await setup.pemesanan.isBlockedByOverdueTagihan(hakPakaiId)).toBe(false);
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

/** The heirship proof the Admin Lokasi uploads when the Pemegang Hak has died and an ahli waris brings the proof on the day (ticket 125). */
describe("Bukti ahli waris on a further burial's consent", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\nsurat keterangan ahli waris\n%%EOF\n");
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1]);
  const SEPULUH_MB = 10 * 1024 * 1024;

  /** A grave whose Pemegang Hak has no recorded email, as a deceased holder's has none to answer. */
  async function hakPakaiTanpaEmail(setup: PemesananSetup) {
    const { lokasi, cells } = await lokasiDenganPetak(setup);
    await izinkanTumpang(setup, lokasi);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id", "Rina Wulandari");
    const hakPakaiId = await beriHakPakai(setup, lokasi, cells[0]!.id, { name: "Siti Aminah", phoneNumber: "081200000001" });
    return { lokasi, pemesan, hakPakaiId };
  }

  /** A further burial asked for that grave: its consent waits on the Lokasi. */
  async function mintaTumpang(setup: PemesananSetup, hak: Awaited<ReturnType<typeof hakPakaiTanpaEmail>>, almarhumName = "Budi Santoso") {
    const placed = await ajukan(setup, hak.lokasi, hak.hakPakaiId, hak.pemesan, almarhumName);
    if (!placed.ok) throw new Error(`ajukanTumpang refused: ${placed.reason}`);
    return placed.pesanan.nomor;
  }

  /** What the private FileStore holds right now, by key. */
  const isiFileStore = (setup: PemesananSetup) => new Set(setup.files.stored.keys());
  const baruDi = (setup: PemesananSetup, sebelum: Set<string>) => [...setup.files.stored.entries()].filter(([kunci]) => !sebelum.has(kunci));

  it("keeps an heirship proof in the private FileStore only, and the order and the Entri Audit show that a proof is on file", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    const sebelum = isiFileStore(setup);

    const dicatat = await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, {
      nomor,
      via: "ahli_waris",
      catatan: "Surat keterangan waris dibawa keluarga.",
      bukti: { body: PDF, contentType: "application/pdf" },
    });
    expect(dicatat).toMatchObject({ ok: true });

    const [disimpan] = baruDi(setup, sebelum);
    expect(baruDi(setup, sebelum)).toHaveLength(1);
    expect(disimpan![1]).toMatchObject({ contentType: "application/pdf", body: PDF });
    const staf = await setup.pemesanan.orderUntukStaf(hak.lokasi.adminLokasi, nomor);
    expect(staf?.tumpang).toMatchObject({ konsen: { state: "disetujui", via: "ahli_waris" }, buktiAhliWarisAda: true, gantiPemegangHakDiingatkan: true });
    const konsen = (await setup.audit.entriesForLokasi(hak.lokasi.lokasiMitra.id)).filter((entri) => entri.action === "pemesanan.konsen_tumpang");
    expect(konsen).toHaveLength(1);
    expect(konsen[0]).toMatchObject({ after: { konsen: "disetujui", via: "ahli_waris", buktiAda: true } });
    // The file's key is nobody's to read: neither the order nor the Audit Log carries it.
    expect(JSON.stringify([staf, konsen])).not.toContain(disimpan![0]);
  });

  it("refuses an heirship consent without the proof: nothing is stored, no Ganti Pemegang Hak reminder is raised, and the consent still waits", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    const sebelum = isiFileStore(setup);

    expect(await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris dibawa keluarga." })).toEqual({
      ok: false,
      reason: "bukti_ahli_waris_wajib",
    });

    expect(baruDi(setup, sebelum)).toEqual([]);
    expect((await setup.pemesanan.orderUntukStaf(hak.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({
      konsen: { state: "menunggu_lokasi", via: null },
      buktiAhliWarisAda: false,
      gantiPemegangHakDiingatkan: false,
    });
    // The Lokasi can still log it once the proof is in hand.
    expect(
      await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris.", bukti: { body: PDF, contentType: "application/pdf" } }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a proof that is empty, over 10 MB, or whose bytes are not a PDF, JPG or PNG", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    const sebelum = isiFileStore(setup);
    const kebesaran = new Uint8Array(SEPULUH_MB + 1);
    kebesaran.set(JPEG);

    const ditolak = [
      { body: new Uint8Array(), contentType: "application/pdf" },
      { body: kebesaran, contentType: "image/jpeg" },
      // A renamed file of another kind: its bytes say it is not a PDF.
      { body: new TextEncoder().encode("bukan pdf, hanya teks"), contentType: "application/pdf" },
      // A real JPEG declared as another kind of file.
      { body: JPEG, contentType: "text/plain" },
      { body: JPEG, contentType: "image/gif" },
    ];
    for (const bukti of ditolak) {
      expect(await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris.", bukti })).toEqual({
        ok: false,
        reason: "berkas_tidak_didukung",
      });
    }

    expect(baruDi(setup, sebelum)).toEqual([]);
    expect((await setup.pemesanan.orderUntukStaf(hak.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({ konsen: { state: "menunggu_lokasi" }, buktiAhliWarisAda: false });
  });

  it("accepts a JPG, a PNG and a PDF of exactly 10 MB", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const sepuluhMb = new Uint8Array(SEPULUH_MB);
    sepuluhMb.set(PDF);
    const diterima = [
      { bukti: { body: JPEG, contentType: "image/jpeg" }, extension: "jpg" },
      { bukti: { body: PNG, contentType: "image/png" }, extension: "png" },
      { bukti: { body: sepuluhMb, contentType: "application/pdf" }, extension: "pdf" },
    ];

    for (const [urutan, { bukti, extension }] of diterima.entries()) {
      const nomor = await mintaTumpang(setup, hak, `Almarhum Ke-${urutan + 1}`);
      const sebelum = isiFileStore(setup);
      expect(await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris.", bukti })).toMatchObject({ ok: true });
      const [disimpan] = baruDi(setup, sebelum);
      expect(disimpan![0]).toMatch(new RegExp(`\\.${extension}$`));
      expect(disimpan![1]).toMatchObject({ contentType: bukti.contentType });
    }
  });

  it("takes no file with a verbal consent: it is refused, nothing is stored, and the consent still waits", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    const sebelum = isiFileStore(setup);

    expect(
      await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "verbal", catatan: "Lewat telepon.", bukti: { body: PDF, contentType: "application/pdf" } }),
    ).toEqual({ ok: false, reason: "bukti_hanya_untuk_ahli_waris" });

    expect(baruDi(setup, sebelum)).toEqual([]);
    expect((await setup.pemesanan.orderUntukStaf(hak.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({ konsen: { state: "menunggu_lokasi" }, buktiAhliWarisAda: false });
    // A verbal consent without a file is as before, and shows no proof.
    expect(await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "verbal", catatan: "Lewat telepon." })).toMatchObject({ ok: true });
    expect((await setup.pemesanan.orderUntukStaf(hak.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({ buktiAhliWarisAda: false });
  });

  it("leaves no file behind when the consent was already settled", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    expect(await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "verbal", catatan: "Lewat telepon." })).toMatchObject({ ok: true });
    const sebelum = isiFileStore(setup);

    expect(
      await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris.", bukti: { body: PDF, contentType: "application/pdf" } }),
    ).toEqual({ ok: false, reason: "konsen_sudah_diputuskan" });

    expect(baruDi(setup, sebelum)).toEqual([]);
  });

  it("opens the proof through a 5-minute signed link, for that Lokasi's own Admin Lokasi and for Admin Platform, and for nobody else", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "ahli_waris", catatan: "Surat waris.", bukti: { body: PDF, contentType: "application/pdf" } });
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    const link = await setup.pemesanan.urlBuktiAhliWaris(hak.lokasi.adminLokasi, nomor);
    if (!link.ok) throw new Error(`urlBuktiAhliWaris refused: ${link.reason}`);
    expect(link.expiresAt).toEqual(new Date(setup.clock.now().getTime() + 5 * 60_000));
    expect(setup.files.open(link.url)).toMatchObject({ body: PDF, contentType: "application/pdf" });
    expect(await setup.pemesanan.urlBuktiAhliWaris(hak.lokasi.admin, nomor)).toMatchObject({ ok: true });

    // Another Lokasi Mitra's Admin Lokasi is refused outright.
    expect(await setup.pemesanan.urlBuktiAhliWaris(lain.adminLokasi, nomor)).toEqual({ ok: false, reason: "tidak_berwenang" });

    // The link is short-lived: past its 5 minutes it opens nothing.
    setup.clock.advance({ minutes: 6 });
    expect(setup.files.open(link.url)).toBeNull();
  });

  it("has no link for a consent that carries no proof, nor for an order that is not there", async () => {
    const setup = pemesananOnTestDatabase(db);
    const hak = await hakPakaiTanpaEmail(setup);
    const nomor = await mintaTumpang(setup, hak);
    await setup.pemesanan.catatKonsenTumpang(hak.lokasi.adminLokasi, { nomor, via: "verbal", catatan: "Lewat telepon." });

    expect(await setup.pemesanan.urlBuktiAhliWaris(hak.lokasi.adminLokasi, nomor)).toEqual({ ok: false, reason: "belum_ada_berkas" });
    expect(await setup.pemesanan.urlBuktiAhliWaris(hak.lokasi.adminLokasi, "MKM-2026-999999")).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
  });
});
