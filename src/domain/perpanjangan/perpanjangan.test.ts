/**
 * Perpanjangan at a Lokasi Mitra, the direct path (spec, domain module 7;
 * ticket 40): when it is open and the note that replaces the button when it is
 * not, the code to the email recorded on the Hak Pakai, terms 1..K with their
 * price, the pay-first Tagihan, and what a payment does: the end date moved from
 * the old end date, the Bukti Perpanjangan, the Pencairan.
 *
 * Fixture: a Hak Pakai of 5 years first buried on 2021-10-15, so it ends on
 * 2026-10-15; the fake Clock starts on 2026-10-01 (inside the window, which
 * opened on 2026-07-15 and closes with the Masa Tenggang on 2027-01-15).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick, retryFailedPaymentEffectsTick } from "@/domain/billing";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { setTagihanStatusForTest } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { emailCodeTo } from "../../../tests/support/identity";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, saatDukaFixture, siapkanOperatorPemesanan, type PemesananModul } from "../../../tests/support/pemesanan";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../tests/support/perpanjangan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;

/** The holder's Akun, as the Kode Masuk to its recorded email creates it. */
async function pemegang(setup: PerpanjanganSetup) {
  return akunDenganEmail(setup, PEMEGANG_HAK.email);
}

/** Orders `terms` terms as the holder and returns the ordered Perpanjangan; fails the test when refused. */
async function pesan(setup: PerpanjanganSetup, hakPakaiId: string, terms = 1) {
  const hasil = await setup.perpanjangan.ajukan({ hakPakaiId, terms, pemohon: await pemegang(setup) });
  if (!hasil.ok) throw new Error(`ajukan refused: ${hasil.reason}`);
  return hasil.perpanjangan;
}

async function bayar(setup: PerpanjanganSetup, tagihanId: string) {
  const dibayar = await setup.billing.recordPayment(tagihanId, { method: QRIS, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  return dibayar.bukti;
}

async function tagihanIdOf(setup: PerpanjanganSetup, perpanjanganId: string) {
  const tercatat = await setup.perpanjangan.perpanjanganOf(perpanjanganId);
  const semua = await setup.billing.cariTagihan(tercatat!.nomorTagihan);
  return semua[0]!.id;
}

async function endDateOf(setup: PerpanjanganSetup, hakPakaiId: string) {
  return (await setup.inventory.hakPakaiUntukPerpanjangan(hakPakaiId))?.endDate;
}

/** The Lokasi's K (the most terms one Perpanjangan may buy), set by Admin Platform. */
async function setMaxTerms(setup: PerpanjanganSetup, fixture: Awaited<ReturnType<typeof hakPakaiSiap>>, maxPerpanjanganTerms: number) {
  const diubah = await setup.lokasi.setPoliciesAndFlags(fixture.admin, fixture.lokasiMitra.id, {
    policies: { ...DEFAULT_POLICIES, maxPerpanjanganTerms },
    flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: false },
  });
  if (!diubah.ok) throw new Error(`policies refused: ${diubah.reason}`);
}

describe("Perpanjangan opens 3 months before the end date and closes with the Masa Tenggang", () => {
  it("is open inside the window, offering a code to the recorded email, masked", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const status = await setup.perpanjangan.status(fixture.hakPakaiId);

    expect(status).toMatchObject({
      boleh: true,
      endDate: "2026-10-15",
      tenureYears: 5,
      maxTerms: 1,
      dibukaSejak: "2026-07-15",
      masaTenggangBerakhir: "2027-01-15",
      jalur: "kode_email",
      emailDisamarkan: "p***@contoh.id",
      tagihanTerbuka: null,
    });
    expect(JSON.stringify(status)).not.toContain(PEMEGANG_HAK.email);
  });

  it("says 'bisa diperpanjang mulai <tanggal>' before the window opens", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    setup.clock.set(wib("2026-07-14 12:00"));

    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "terlalu_awal", mulaiPada: "2026-07-15" } });
    const tawaran = await setup.perpanjangan.tawaran(fixture.hakPakaiId);
    expect(tawaran).toMatchObject({ ok: false, reason: "tidak_boleh" });
  });

  it("stays open through the Masa Tenggang and then says 'hubungi Admin Lokasi'", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    setup.clock.set(wib("2027-01-15 20:00"));
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: true });
    setup.clock.set(wib("2027-01-16 00:30"));
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({
      boleh: false,
      catatan: { kind: "hubungi_admin_lokasi", sebab: "lewat_masa_tenggang" },
    });
  });

  it("says 'berlaku selamanya' for a perpetual Hak Pakai", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const selamanya = await setup.tariffs.createJenisMakam(fixture.admin, fixture.lokasiMitra.id, {
      name: "Wakaf selamanya",
      description: "",
      tariff: { hargaHakPakai: 1_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!selamanya.ok) throw new Error(`Jenis Makam refused: ${selamanya.reason}`);
    const blok = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, { name: "S", rows: 1, cols: 1, jenisMakamId: selamanya.jenisMakam.id });
    if (!blok.ok) throw new Error(`Blok refused: ${blok.reason}`);
    const [cell] = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id)).filter((one) => one.kind === "petak");
    const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell!.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: PEMEGANG_HAK,
      pemakaman: { almarhumName: "Almarhum Wakaf", date: "2021-10-15" },
    });
    if (!diisi.ok || !diisi.hakPakaiId) throw new Error("clearPetak refused");

    expect(await setup.perpanjangan.status(diisi.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "selamanya" } });
  });

  it("says 'hubungi Admin Lokasi' for a Hak Pakai that is Berakhir", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const berakhir = await setup.inventory.akhiriHakPakai({ hakPakaiId: fixture.hakPakaiId, alasan: "Dikembalikan" });
    expect(berakhir.ok).toBe(true);

    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "berakhir" } });
  });

  it("says 'hubungi Admin Lokasi' for a Hak Pakai that is Dibatalkan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { dataMenyusul: true });
    const dibatalkan = await setup.inventory.batalkanHakPakai({ hakPakaiId: fixture.hakPakaiId, alasan: "Salah catat" });
    expect(dibatalkan.ok).toBe(true);

    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "dibatalkan" } });
  });

  it("names an unknown Hak Pakai as one to take up with the Admin Lokasi, never as an error", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    expect(await setup.perpanjangan.status("00000000-0000-4000-8000-000000000000")).toEqual({
      boleh: false,
      catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" },
    });
  });
});

describe("an overdue Saat Duka Tagihan blocks the Perpanjangan", () => {
  it("says 'Lunasi Tagihan TGH/... terlebih dahulu' with a pay link, and opens once it is paid", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const modul = setup as unknown as PemesananModul;
    const fixture = await saatDukaFixture(modul);
    await siapkanOperatorPemesanan(modul);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const petak = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak")[0]!;
    const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, petakId: petak.id, pemakamanAt: "2026-10-02T10:00" });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    const hakPakaiId = (await setup.pemesanan.hakPakaiIdForTagihan(order!.tagihanId!))!;
    setup.clock.set(wib("2026-10-06 08:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, tanggal: "2026-10-06" });
    if (!dicatat.ok) throw new Error(`burial refused: ${dicatat.reason}`);

    // Five years on, the Hak Pakai (which ends 2031-10-06) is inside its window, and its Saat Duka Tagihan was never paid.
    setup.clock.set(wib("2031-09-20 09:00"));
    await setTagihanStatusForTest(db, order!.tagihanId!, "lewat_jatuh_tempo");
    const diblokir = await setup.perpanjangan.status(hakPakaiId);
    expect(diblokir).toMatchObject({ boleh: false, catatan: { kind: "lunasi_tagihan", nomorTagihan: expect.stringMatching(/^TGH\/2026\/\d{6}$/) } });
    const link = diblokir.boleh ? "" : diblokir.catatan.kind === "lunasi_tagihan" ? diblokir.catatan.link : "";
    const tagihan = await setup.billing.documentByLink(link);
    expect(tagihan).toMatchObject({ type: "tagihan" });

    await setTagihanStatusForTest(db, order!.tagihanId!, "lunas");
    expect(await setup.perpanjangan.status(hakPakaiId)).toMatchObject({ boleh: true, endDate: "2031-10-06" });
  });
});

describe("a Hak Pakai flagged Perlu Verifikasi must be completed by the Admin Lokasi first", () => {
  it("blocks the Perpanjangan until the Admin Lokasi records the end date and the holder, and audits it", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { dataMenyusul: true });

    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "perlu_verifikasi" } });

    const belumLengkap = await setup.inventory.lengkapiHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId: fixture.hakPakaiId, pemegangHak: PEMEGANG_HAK });
    expect(belumLengkap).toEqual({ ok: false, reason: "tanggal_berakhir_wajib" });

    const lengkap = await setup.inventory.lengkapiHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
      hakPakaiId: fixture.hakPakaiId,
      endDate: "2026-10-15",
      pemegangHak: PEMEGANG_HAK,
    });
    expect(lengkap).toEqual({ ok: true });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: true, endDate: "2026-10-15", jalur: "kode_email" });
    const entri = await setup.audit.entriesAbout({ kind: "hak_pakai", id: fixture.hakPakaiId });
    expect(entri.map((one) => one.action)).toContain("hak_pakai.lengkapi");
  });

  it("is the Admin Lokasi's own to do, and only of that Lokasi", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { dataMenyusul: true });
    const akun = await pemegang(setup);
    const actor = await setup.identity.actorFromCookies(null);
    expect(actor).toBeNull();

    const ditolak = await setup.inventory.lengkapiHakPakai(
      { accountId: akun.accountId, roles: ["pelanggan"] } as never,
      fixture.lokasiMitra.id,
      { hakPakaiId: fixture.hakPakaiId, endDate: "2026-10-15", pemegangHak: PEMEGANG_HAK },
    );
    expect(ditolak).toMatchObject({ ok: false });
  });
});

describe("terms 1..K, priced from quote() plus the Biaya Layanan Platform", () => {
  it("offers one term by default (K = 1) at the Perpanjangan price plus the platform fee", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const tawaran = await setup.perpanjangan.tawaran(fixture.hakPakaiId);

    expect(tawaran).toMatchObject({ ok: true, endDate: "2026-10-15" });
    if (!tawaran.ok) return;
    expect(tawaran.opsi).toHaveLength(1);
    // Rp 3.000.000 for the term and Rp 150.000 Biaya Layanan Platform.
    expect(tawaran.opsi[0]).toMatchObject({ terms: 1, total: 3_150_000, endDateBaru: "2031-10-15" });
    expect(tawaran.opsi[0]!.lines.map((line) => line.amount)).toEqual([3_000_000, 150_000]);
  });

  it("offers up to the Lokasi's K terms, each priced per term with the fee once, and none past the QRIS cap", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await setMaxTerms(setup, fixture, 4);

    const tawaran = await setup.perpanjangan.tawaran(fixture.hakPakaiId);

    if (!tawaran.ok) throw new Error("no offer");
    // Rp 3.150.000, Rp 6.150.000, Rp 9.150.000; four terms would be Rp 12.150.000, over the Rp 10.000.000 QRIS cap.
    expect(tawaran.opsi.map((one) => [one.terms, one.total, one.endDateBaru])).toEqual([
      [1, 3_150_000, "2031-10-15"],
      [2, 6_150_000, "2036-10-15"],
      [3, 9_150_000, "2041-10-15"],
    ]);
  });

  it("refuses more terms than K", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const hasil = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 2, pemohon: await pemegang(setup) });

    expect(hasil).toEqual({ ok: false, reason: "terms_melebihi_batas", maxTerms: 1 });
  });
});

describe("the code to the email recorded on the Hak Pakai", () => {
  it("goes to the recorded email, and a correct code logs the holder in so the order can be placed", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const terkirim = await setup.perpanjangan.kirimKode({ hakPakaiId: fixture.hakPakaiId, ip: "203.0.113.7" });
    expect(terkirim).toMatchObject({ ok: true, emailDisamarkan: "p***@contoh.id" });
    expect(setup.email.sent.at(-1)?.to).toBe(PEMEGANG_HAK.email);

    const salah = await setup.perpanjangan.verifikasiKode({ hakPakaiId: fixture.hakPakaiId, code: "000000" });
    expect(salah.ok).toBe(false);
    const login = await setup.perpanjangan.verifikasiKode({ hakPakaiId: fixture.hakPakaiId, code: emailCodeTo(setup.email, PEMEGANG_HAK.email) });
    if (!login.ok) throw new Error(`code refused: ${login.reason}`);

    const hasil = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: { accountId: login.account.id, email: login.account.email } });
    expect(hasil).toMatchObject({ ok: true });
  });

  it("is skipped for the Akun logged in with the recorded Email Terverifikasi, and asked of anyone else", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const holder = await pemegang(setup);
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");

    expect(await setup.perpanjangan.status(fixture.hakPakaiId, holder)).toMatchObject({ boleh: true, jalur: "sudah_masuk" });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId, orang)).toMatchObject({ boleh: true, jalur: "kode_email" });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: true, jalur: "kode_email" });
  });

  it("is never sent, and no order is taken, for an Akun whose email is not the recorded one", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");

    expect(await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: orang })).toEqual({ ok: false, reason: "bukan_pemegang_hak" });
    // Someone else's account id under the holder's email does not pass either.
    const holder = await pemegang(setup);
    expect(await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: { accountId: orang.accountId, email: holder.email } })).toEqual({
      ok: false,
      reason: "bukan_pemegang_hak",
    });
  });

  it("points a Hak Pakai with no recorded email to the manual paths: no code goes out and no order is taken", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { pemegang: { name: "Bapak Tanpa Email", phoneNumber: "081234500000" } });
    const kirimSebelum = setup.email.sent.length;

    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: true, jalur: "tanpa_email", emailDisamarkan: null });
    expect(await setup.perpanjangan.kirimKode({ hakPakaiId: fixture.hakPakaiId, ip: "203.0.113.8" })).toEqual({ ok: false, reason: "tanpa_email" });
    expect(setup.email.sent).toHaveLength(kirimSebelum);
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");
    expect(await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: orang })).toEqual({ ok: false, reason: "bukan_pemegang_hak" });
  });
});

describe("the pay-first Tagihan addressed to the Pemegang Hak", () => {
  it("is issued to the holder, due 3x24 h after issue, and announced by email", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const diterbitkan = setup.clock.now();

    const perpanjangan = await pesan(setup, fixture.hakPakaiId);

    expect(perpanjangan.tagihan).toMatchObject({ total: 3_150_000, dueAt: new Date(diterbitkan.getTime() + 72 * 3_600_000) });
    const tagihan = await setup.billing.cariTagihan(perpanjangan.tagihan.nomorTagihan);
    const baca = await setup.billing.tagihan(tagihan[0]!.id);
    expect(baca).toMatchObject({
      kind: "pay_first",
      status: "belum_dibayar",
      nomorPemesanan: null,
      placeName: "Makam Wakaf Al-Ikhlas",
      addressee: { role: "pemegang_hak", name: PEMEGANG_HAK.name },
    });
    expect(baca!.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["perpanjangan", 3_000_000],
      ["biaya_layanan_platform", 150_000],
    ]);
    const pesan1 = await setup.notifications.pesanTagihan(baca!.id);
    expect(pesan1.map((one) => one.template)).toContain("tagihan_terbit");
  });

  it("keeps one open Tagihan per Hak Pakai: a second order is pointed to the first, never changed", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const pertama = await pesan(setup, fixture.hakPakaiId);

    const kedua = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: await pemegang(setup) });

    expect(kedua).toMatchObject({ ok: false, reason: "tagihan_terbuka", tagihanTerbuka: { perpanjanganId: pertama.id, nomorTagihan: pertama.tagihan.nomorTagihan } });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: true, tagihanTerbuka: { perpanjanganId: pertama.id } });
  });

  it("lapses to Dibatalkan at 3x24 h, and the holder may then order again", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const pertama = await pesan(setup, fixture.hakPakaiId);

    setup.clock.set(pertama.tagihan.dueAt);
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    const tercatat = await setup.perpanjangan.perpanjanganOf(pertama.id);
    expect(tercatat).toMatchObject({ status: "dibatalkan", dibayarPada: null });
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");
    const kedua = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: await pemegang(setup) });
    expect(kedua).toMatchObject({ ok: true });
  });

  it("cannot be paid once it has lapsed, so the Hak Pakai is not extended", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);

    setup.clock.set(perpanjangan.tagihan.dueAt);
    const terlambat = await setup.billing.recordPayment(tagihanId, { method: QRIS, reference: null });

    expect(terlambat).toEqual({ ok: false, reason: "batas_pembayaran_lewat" });
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");
  });
});

describe("the new end date is the old end date plus terms x N, applied on payment", () => {
  it("counts an early renewal from the old end date, not from the day of payment", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");

    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));

    // Paid on 2026-10-01, two weeks early: 2026-10-15 plus 5 years, not 2031-10-01.
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ status: "lunas", endDateLama: "2026-10-15", endDateBaru: "2031-10-15" });
  });

  it("applies a renewal paid inside the Masa Tenggang the same way", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    setup.clock.set(wib("2026-12-20 10:00"));
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);

    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toMatchObject({ boleh: false, catatan: { kind: "terlalu_awal", mulaiPada: "2031-07-15" } });
  });

  it("adds K terms of the Hak Pakai's own term", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await setMaxTerms(setup, fixture, 3);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId, 2);
    expect(perpanjangan.tagihan.total).toBe(6_150_000);

    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2036-10-15");
  });

  it("extends a Kavling Keluarga as a whole, named by its number and its Petak", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const blok = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, { name: "K", rows: 1, cols: 2, jenisMakamId: fixture.jenisMakam.id });
    if (!blok.ok) throw new Error(`Blok refused: ${blok.reason}`);
    const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id)).filter((cell) => cell.kind === "petak");
    const kavling = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!kavling.ok) throw new Error(`Kavling refused: ${kavling.reason}`);
    const diisi = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, kavling.kavlingId, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Keluarga Hasan", phoneNumber: "081234567891", email: "keluarga@contoh.id" },
      pemakaman: { almarhumName: "Hasan", date: "2021-11-01", petakId: cells[0]!.id },
    });
    if (!diisi.ok || !diisi.hakPakaiId) throw new Error("clearKavling refused");
    const keluarga = await akunDenganEmail(setup, "keluarga@contoh.id");

    const hasil = await setup.perpanjangan.ajukan({ hakPakaiId: diisi.hakPakaiId, terms: 1, pemohon: keluarga });
    if (!hasil.ok) throw new Error(`refused: ${hasil.reason}`);
    await bayar(setup, await tagihanIdOf(setup, hasil.perpanjangan.id));

    expect(await endDateOf(setup, diisi.hakPakaiId)).toBe("2031-11-01");
    const bukti = await setup.billing.buktiPerpanjanganById((await setup.perpanjangan.perpanjanganOf(hasil.perpanjangan.id))!.buktiId!);
    expect(bukti?.petakNomor).toBe(`Kavling ${kavling.nomorKavling} (${cells.map((cell) => cell.nomorMakam).join(", ")})`);
  });

  it("extends once, however often the payment is reported", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);

    const pertama = await bayar(setup, tagihanId);
    const kedua = await bayar(setup, tagihanId);

    expect(kedua.nomorBukti).toBe(pertama.nomorBukti);
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
  });
});

describe("the Bukti Perpanjangan", () => {
  it("is issued in the Lokasi Mitra's name with the Petak, the Pemegang Hak, both end dates and the terms bought, under the PT JKP header", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));

    const tercatat = await setup.perpanjangan.perpanjanganOf(perpanjangan.id);
    const bukti = await setup.billing.buktiPerpanjanganById(tercatat!.buktiId!);

    expect(bukti).toMatchObject({
      nomor: expect.stringMatching(/^BPP\/2026\/\d{6}$/),
      lokasiName: "Makam Wakaf Al-Ikhlas",
      petakNomor: fixture.nomorMakam,
      pemegangHakName: PEMEGANG_HAK.name,
      endDateLama: "2026-10-15",
      endDateBaru: "2031-10-15",
      terms: 1,
    });
    expect(bukti!.header.legalName).toBeTruthy();
    // It opens on its own unguessable link, and "Unduh PDF" is named after its number.
    expect(await setup.billing.documentByLink(bukti!.link)).toMatchObject({ type: "bukti_perpanjangan", bukti: { nomor: bukti!.nomor } });
    expect(await setup.billing.documentPdf(bukti!.link)).toMatchObject({ fileName: `${bukti!.nomor.replaceAll("/", "-")}.pdf` });
  });

  it("goes to the holder by email, once", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);
    await bayar(setup, tagihanId);
    await bayar(setup, tagihanId);

    const pesanTerkirim = await setup.notifications.pesanPemesanan(perpanjangan.id);

    expect(pesanTerkirim.map((one) => one.template)).toEqual(["bukti_perpanjangan_terbit"]);
    expect(pesanTerkirim[0]!.subject).toMatch(/^Bukti Perpanjangan BPP\/2026\/\d{6}/);
  });

  it("is append-only: the database refuses to rewrite or remove it", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));
    const { buktiPerpanjangan } = await import("@/domain/billing/schema");

    await expect(db.update(buktiPerpanjangan).set({ terms: 9 })).rejects.toThrow();
    await expect(db.delete(buktiPerpanjangan)).rejects.toThrow();
  });
});

describe("anyone may pay a Perpanjangan Tagihan, and paying gives no right", () => {
  it("extends the holder's Hak Pakai and leaves the payer with nothing", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const pembayar = await akunDenganEmail(setup, "tetangga@contoh.id");

    // The Tagihan's page is open to whoever holds its link, and the payment names no payer.
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);
    const halaman = await setup.billing.documentByLink((await setup.billing.tagihan(tagihanId))!.link);
    expect(halaman).toMatchObject({ type: "tagihan", notPayableBecause: null });
    await bayar(setup, tagihanId);

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    expect(await setup.inventory.makamKeluargaSaya({ email: pembayar.email })).toEqual([]);
    expect(await setup.inventory.makamKeluargaSaya({ email: PEMEGANG_HAK.email })).toEqual([expect.objectContaining({ hakPakaiId: fixture.hakPakaiId, tanggalBerakhir: "2031-10-15" })]);
    // The payer can order nothing on this Hak Pakai: the right stays with the recorded holder.
    expect(await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: pembayar })).toEqual({ ok: false, reason: "tidak_boleh", catatan: expect.anything() });
  });
});

describe("Pencairan: the Perpanjangan item is due on payment", () => {
  it("owes the Lokasi Mitra the Perpanjangan price at the instant of payment, without the platform fee, once", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);

    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    await bayar(setup, tagihanId);
    const hasil = await setup.payouts.tick();

    expect(hasil).toEqual({ items: 1, potongan: 0, dilewati: 0 });
    const due = await setup.payouts.pencairanJatuhTempo();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ recipient: { kind: "lokasi_mitra", nama: "Makam Wakaf Al-Ikhlas" }, itemCount: 1, amount: 3_000_000 });
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
  });
});

describe("messages are queued in the transaction of the write they announce", () => {
  it("leaves no Perpanjangan, no Tagihan and no queued email when the order rolls back", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const holder = await pemegang(setup);
    const terkirimSebelum = setup.email.sent.length;

    setup.gagalSetelahAntre.tagihanTerbit = true;
    await expect(setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: holder })).rejects.toThrow();

    expect(await setup.perpanjangan.perpanjanganUntukHakPakai(fixture.hakPakaiId)).toEqual([]);
    expect(await setup.billing.cariTagihan("TGH")).toEqual([]);
    setup.clock.set(wib("2026-10-03 09:00"));
    expect(await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).toMatchObject({ terkirim: 0, ditunda: 0 });
    expect(setup.email.sent).toHaveLength(terkirimSebelum);
  });

  it("leaves the Hak Pakai, the Bukti and the email untouched when the payment's effect rolls back, and completes them once on the retry", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);

    setup.gagalSetelahAntre.buktiPerpanjangan = true;
    await bayar(setup, tagihanId);

    // The payment stands; what the effect did was rolled back with it, the queued email included.
    expect(await setup.billing.tagihan(tagihanId)).toMatchObject({ status: "lunas" });
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");
    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ buktiId: null, dibayarPada: null });
    expect(await setup.notifications.pesanPemesanan(perpanjangan.id)).toEqual([]);

    setup.gagalSetelahAntre.buktiPerpanjangan = false;
    await retryFailedPaymentEffectsTick({ db, paymentEffects: setup.paymentEffects, reportError: () => {} }, setup.clock.now());
    await retryFailedPaymentEffectsTick({ db, paymentEffects: setup.paymentEffects, reportError: () => {} }, setup.clock.now());

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    expect((await setup.notifications.pesanPemesanan(perpanjangan.id)).map((one) => one.template)).toEqual(["bukti_perpanjangan_terbit"]);
  });
});

describe("a payment that arrives after the Hak Pakai has ended is not applied by itself", () => {
  it("records the money and opens a Pembayaran Perlu Ditinjau instead of extending an ended Hak Pakai", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);
    const berakhir = await setup.inventory.akhiriHakPakai({ hakPakaiId: fixture.hakPakaiId, alasan: "Diakhiri Admin Lokasi" });
    expect(berakhir.ok).toBe(true);

    const bukti = await bayar(setup, tagihanId);
    await bayar(setup, tagihanId);

    // The money is recorded: the Tagihan is Lunas with its Bukti Pembayaran, and nothing failed or retries.
    expect(await setup.billing.tagihan(tagihanId)).toMatchObject({ status: "lunas" });
    expect(setup.reportedErrors).toEqual([]);
    // The Hak Pakai is not extended and no Bukti Perpanjangan exists.
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");
    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ status: "perlu_ditinjau", buktiId: null, endDateBaru: null });
    expect(await setup.notifications.pesanPemesanan(perpanjangan.id)).toEqual([]);
    // Admin Platform's Antrean row: one Pembayaran Perlu Ditinjau for that Tagihan, however often the payment is reported.
    const ditinjau = await setup.billing.pembayaranPerluDitinjau();
    expect(ditinjau).toEqual([
      expect.objectContaining({
        reason: "tidak_dapat_diterapkan",
        amount: 3_150_000,
        providerPaymentId: bukti.nomorBukti,
        tagihan: { id: tagihanId, nomorTagihan: perpanjangan.tagihan.nomorTagihan },
      }),
    ]);
    // The Lokasi is owed nothing while it is under review.
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
  });

  it("does the same for a payment made after the Masa Tenggang closed, though the Hak Pakai was never ended", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    setup.clock.set(wib("2027-01-14 10:00"));
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);
    const tagihanId = await tagihanIdOf(setup, perpanjangan.id);

    // Due on 2027-01-17, but the Masa Tenggang (to 2027-01-15) is over when the money comes.
    setup.clock.set(wib("2027-01-16 09:00"));
    await bayar(setup, tagihanId);

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2026-10-15");
    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ status: "perlu_ditinjau" });
    expect((await setup.billing.pembayaranPerluDitinjau()).map((one) => one.reason)).toEqual(["tidak_dapat_diterapkan"]);
  });

  it("still applies a payment made on the last day of the Masa Tenggang", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    setup.clock.set(wib("2027-01-14 10:00"));
    const perpanjangan = await pesan(setup, fixture.hakPakaiId);

    setup.clock.set(wib("2027-01-15 20:00"));
    await bayar(setup, await tagihanIdOf(setup, perpanjangan.id));

    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    expect(await setup.billing.pembayaranPerluDitinjau()).toEqual([]);
  });
});

describe("the Makam keluarga hub leads to the Perpanjangan", () => {
  it("answers a lookup with the Hak Pakai's id, which opens that grave's Perpanjangan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const hasil = await setup.inventory.cariMakam({ ip: "203.0.113.20", bentuk: "nomor_makam", lokasiId: fixture.lokasiMitra.id, nomor: fixture.nomorMakam });

    if (!hasil.ok) throw new Error("lookup refused");
    expect(hasil.ditemukan[0]?.hakPakaiId).toBe(fixture.hakPakaiId);
    expect(await setup.perpanjangan.status(hasil.ditemukan[0]!.hakPakaiId)).toMatchObject({ boleh: true, endDate: "2026-10-15" });
  });
});
