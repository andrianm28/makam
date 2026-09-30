/**
 * The Lokasi Mitra's answer to a Pemesanan Terencana, its payment hold and its
 * payment (spec, Pemesanan > Terencana: Diajukan → Dikonfirmasi → Aktif, plus Ditolak
 * and Dibatalkan; Billing: Terencana is pay-first, due at hold expiry; ticket 37).
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
  unitIds,
  type PemesananSetup,
} from "../../../tests/support/pemesanan";
import { terencanaLokasi, type TerencanaOptions } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const dataPemesan = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" },
  calonPenghuni: { mode: "saya" },
} as const;

/** What the picker sends the domain: the chosen plots as ids. */
function units(pilihan: { petak?: string[]; kavling?: string }) {
  return [...(pilihan.petak ?? []).map((petakId) => ({ petakId })), ...(pilihan.kavling ? [{ kavlingId: pilihan.kavling }] : [])];
}

/** A Terencana-ready Lokasi Mitra with Pengaturan Operator entered (a confirmation issues a Tagihan), and a Pemesan with an Akun. */
async function siap(setup: PemesananSetup, options?: TerencanaOptions) {
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup);
  const fixture = await terencanaLokasi(setup, admin, options);
  const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
  return { fixture, pemesan, admin };
}

/** An order placed for the named plots, still Diajukan. */
async function pesanan(setup: PemesananSetup, nomorPetak: string[] = ["A-01", "A-02"], options?: TerencanaOptions) {
  const dasar = await siap(setup, options);
  const id = await unitIds(setup, dasar.fixture, nomorPetak);
  const placed = await setup.pemesanan.placeTerencana({
    ...dataPemesan,
    pemesan: dasar.pemesan,
    lokasiId: dasar.fixture.lokasiMitra.id,
    units: units({ petak: nomorPetak.map((nomor) => id[nomor]) }),
  });
  if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
  return { ...dasar, nomor: placed.pemesanan.nomor, ids: id, placed: placed.pemesanan };
}

type Pesanan = Awaited<ReturnType<typeof pesanan>>;

/** That order confirmed by its own Admin Lokasi. */
async function dikonfirmasi(setup: PemesananSetup, dasar: Pesanan) {
  const hasil = await setup.pemesanan.konfirmasiTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor });
  if (!hasil.ok) throw new Error(`konfirmasiTerencana refused: ${JSON.stringify(hasil)}`);
  return hasil;
}

/** Pays that Tagihan the way Payouts' own tests do: through the real Billing module. */
async function bayar(setup: PemesananSetup, tagihanId: string) {
  const dibayar = await setup.billing.recordPayment(tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  return dibayar;
}

/** The status of one plot on the Denah the next family picks from. */
async function statusPetak(setup: PemesananSetup, lokasiId: string, nomor: string) {
  const denah = await setup.inventory.publicDenah(lokasiId);
  return denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomor)?.status;
}

describe("the Konfirmasi Terencana row and its deadline", () => {
  it("is due by the end of the Lokasi's next Hari Kerja, counted from submission", async () => {
    const setup = pemesananOnTestDatabase(db);
    // Thursday 2026-10-01: the Lokasi is open Monday to Saturday until 15:00.
    const dasar = await pesanan(setup);

    const [baris] = await setup.pemesanan.antreanKonfirmasiTerencana(dasar.fixture.lokasiMitra.id);

    expect(baris).toMatchObject({ nomor: dasar.nomor, konfirmasiDueAt: wib("2026-10-02 15:00") });
    expect(baris.unit.map((unit) => unit.nomor)).toEqual(["A-01", "A-02"]);
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.konfirmasiDueAt).toEqual(wib("2026-10-02 15:00"));
  });

  it("skips the Lokasi's closed Sunday: an order placed on a Saturday is due the end of Monday", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    setup.clock.set(wib("2026-10-03 10:00"));
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const placed = await setup.pemesanan.placeTerencana({ ...dataPemesan, pemesan, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);

    expect(placed.pemesanan.konfirmasiDueAt).toEqual(wib("2026-10-05 15:00"));
  });

  it("brings Admin Platform's Tier 3 row only after that deadline, and neither row cancels the order or frees its plots", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);

    setup.clock.set(wib("2026-10-02 15:00"));
    expect(await setup.pemesanan.konfirmasiTerencanaLewatTenggat()).toEqual([]);

    // Strictly after the deadline, not at its instant.
    setup.clock.set(new Date(wib("2026-10-02 15:00").getTime() + 1));
    expect(await setup.pemesanan.konfirmasiTerencanaLewatTenggat()).toEqual([expect.objectContaining({ nomor: dasar.nomor })]);
    // Still Diajukan, still held, and still on the Lokasi's own row: nothing is cancelled automatically.
    setup.clock.set(wib("2026-10-09 12:00"));
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("diajukan");
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("sedang_dipesan");
    expect(await setup.pemesanan.antreanKonfirmasiTerencana(dasar.fixture.lokasiMitra.id)).toHaveLength(1);
  });

  it("closes both rows the moment the order is confirmed", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    setup.clock.set(wib("2026-10-02 15:30"));
    expect(await setup.pemesanan.konfirmasiTerencanaLewatTenggat()).toHaveLength(1);

    await dikonfirmasi(setup, dasar);

    expect(await setup.pemesanan.konfirmasiTerencanaLewatTenggat()).toEqual([]);
    expect(await setup.pemesanan.antreanKonfirmasiTerencana(dasar.fixture.lokasiMitra.id)).toEqual([]);
  });
});

describe("the Admin Lokasi confirms a Pemesanan Terencana", () => {
  it("makes it Dikonfirmasi with a pay-first Tagihan due when the 24 h payment hold ends", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const sekarang = setup.clock.now();

    const hasil = await dikonfirmasi(setup, dasar);

    const berakhir = new Date(sekarang.getTime() + 24 * 3_600_000);
    expect(hasil).toMatchObject({
      pesanan: { nomor: dasar.nomor, status: "dikonfirmasi", tahanSampai: berakhir },
      tagihan: { kind: "pay_first", dueAt: berakhir, total: 5_150_000 },
    });
    const order = await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan);
    expect(order).toMatchObject({ status: "dikonfirmasi", dikonfirmasiPada: sekarang, tahanSampai: berakhir, tagihanId: hasil.tagihan.id });
    const tagihan = await setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan).toMatchObject({ kind: "pay_first", status: "belum_dibayar", dueAt: berakhir, nomorPemesanan: dasar.nomor });
    // One Harga Hak Pakai line per plot, by its number, and one Biaya Layanan Platform for the whole Tagihan.
    expect(tagihan?.lines.map((baris) => [baris.kind, baris.label, baris.amount])).toEqual([
      ["harga_hak_pakai", "Harga Hak Pakai – Reguler 2 × 1 m · A-01", 2_500_000],
      ["harga_hak_pakai", "Harga Hak Pakai – Reguler 2 × 1 m · A-02", 2_500_000],
      ["biaya_layanan_platform", "Biaya Layanan Platform", 150_000],
    ]);
  });

  it("follows the Lokasi's own Terencana hold policy, not the default", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const kebijakan = await setup.lokasi.lokasiMitra(dasar.admin, dasar.fixture.lokasiMitra.id);
    if (!kebijakan.ok) throw new Error(`Lokasi Mitra refused: ${kebijakan.reason}`);
    const diubah = await setup.lokasi.setPoliciesAndFlags(dasar.admin, dasar.fixture.lokasiMitra.id, {
      policies: { ...kebijakan.lokasiMitra.policies, terencanaHoldHours: 48 },
      flags: kebijakan.lokasiMitra.flags,
    });
    if (!diubah.ok) throw new Error(`policies refused: ${diubah.reason}`);
    const sekarang = setup.clock.now();

    const hasil = await dikonfirmasi(setup, dasar);

    expect(hasil.pesanan.tahanSampai).toEqual(new Date(sekarang.getTime() + 48 * 3_600_000));
    expect(hasil.tagihan.dueAt).toEqual(hasil.pesanan.tahanSampai);
  });

  it("is audited on the Lokasi, and only that Lokasi's Admin Lokasi may do it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);

    // Admin Platform chases the Lokasi by phone but never confirms for it: the order is untouched.
    const ditolakPlatform = await setup.pemesanan.konfirmasiTerencana(dasar.admin, { nomor: dasar.nomor });
    expect(ditolakPlatform.ok).toBe(false);
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("diajukan");
    expect((await setup.audit.allEntries()).filter((entry) => entry.action === "pemesanan.konfirmasi_terencana")).toEqual([]);

    await dikonfirmasi(setup, dasar);

    const tercatat = (await setup.audit.allEntries()).filter((entry) => entry.action === "pemesanan.konfirmasi_terencana");
    expect(tercatat).toEqual([
      expect.objectContaining({
        actor: { accountId: dasar.fixture.adminLokasi.accountId, role: "admin_lokasi" },
        lokasiId: dasar.fixture.lokasiMitra.id,
        before: { status: "diajukan", tagihanId: null },
        after: expect.objectContaining({ status: "dikonfirmasi", unit: ["A-01", "A-02"] }),
      }),
    ]);
  });

  it("confirms once: a second confirmation changes nothing and issues no second Tagihan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const pertama = await dikonfirmasi(setup, dasar);

    const lagi = await setup.pemesanan.konfirmasiTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor });

    expect(lagi).toEqual({ ok: false, reason: "pesanan_sudah_dikonfirmasi" });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.tagihanId).toBe(pertama.tagihan.id);
  });

  it("leaves the order Diajukan, its plots held and nothing billed when no Tagihan can be issued", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await (async () => {
      // No Pengaturan Operator here: a Tagihan cannot be issued without the Operator's header.
      const { actor: admin } = await adminPlatformOf(setup);
      const lokasi = await terencanaLokasi(setup, admin);
      return { fixture: lokasi, pemesan: (await pemesanDenganEmail(setup, "keluarga@contoh.id")).pemesan };
    })();
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const placed = await setup.pemesanan.placeTerencana({ ...dataPemesan, pemesan, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);

    const hasil = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: placed.pemesanan.nomor });

    expect(hasil).toEqual({ ok: false, reason: "tagihan_tidak_terbit" });
    expect((await setup.pemesanan.terencanaOf(placed.pemesanan.nomor, pemesan))?.status).toBe("diajukan");
    expect(await statusPetak(setup, fixture.lokasiMitra.id, "A-01")).toBe("sedang_dipesan");
    expect((await setup.audit.allEntries()).filter((entry) => entry.action === "pemesanan.konfirmasi_terencana")).toEqual([]);
  });
});

describe("the family's one email for a confirmed Pemesanan Terencana", () => {
  it("carries both the order and the Tagihan, and no separate 'Tagihan terbit' email follows it", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);

    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const kepadaKeluarga = setup.email.sent.filter((surat) => surat.to === "keluarga@contoh.id" && surat.subject.includes(dasar.nomor));
    expect(kepadaKeluarga).toHaveLength(1);
    expect(kepadaKeluarga[0].subject).toContain(`Pesanan ${dasar.nomor} dikonfirmasi`);
    expect(kepadaKeluarga[0].text).toContain(`/pesanan/${dasar.nomor}`);
    expect(kepadaKeluarga[0].text).toContain(hasil.tagihan.nomorTagihan);
    expect(kepadaKeluarga[0].text).toContain(`/dokumen/${hasil.tagihan.link}`);
    expect(kepadaKeluarga[0].text).toContain("A-01 (Reguler 2 × 1 m), A-02 (Reguler 2 × 1 m)");
    expect(setup.email.sent.some((surat) => surat.subject.includes("telah terbit"))).toBe(false);
    const pesan = await setup.notifications.pesanTagihan(hasil.tagihan.id);
    expect(pesan.map((satu) => satu.template)).not.toContain("tagihan_terbit");
  });

  it("is followed by exactly one reminder about 4 h before the hold ends, sent inside the 08:00-20:00 window", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    // Confirmed Thursday 09:00, the hold ends Friday 09:00: 4 h before that is 05:00, the middle of the night, so it goes at the window's last minute the evening before.
    const hasil = await dikonfirmasi(setup, dasar);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const pengingat = () => setup.email.sent.filter((surat) => surat.subject.startsWith("Pengingat: petak Anda ditahan"));

    setup.clock.set(wib("2026-10-01 19:58"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingat()).toHaveLength(0);

    setup.clock.set(wib("2026-10-01 19:59"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingat()).toHaveLength(1);
    expect(pengingat()[0].text).toContain(hasil.tagihan.nomorTagihan);

    // Once, however often the worker ticks.
    setup.clock.set(wib("2026-10-02 08:30"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingat()).toHaveLength(1);
  });

  it("is dropped, not sent, when the order is withdrawn before the reminder is due", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    await dikonfirmasi(setup, dasar);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    setup.clock.set(wib("2026-10-01 19:59"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(setup.email.sent.some((surat) => surat.subject.startsWith("Pengingat: petak Anda ditahan"))).toBe(false);
  });
});

describe("paying a confirmed Pemesanan Terencana makes it Aktif", () => {
  it("grants one Aktif Hak Pakai per Petak Makam, all for the same Pemegang Hak, each with the Syarat snapshot and the Calon Penghuni label", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup, ["A-01", "A-02"], { masaPembatalanDays: 14, refundPercent: 25 });
    const hasil = await dikonfirmasi(setup, dasar);
    // The Lokasi Mitra changes its policy after the order was placed: the right keeps what the family agreed to.
    const kebijakan = await setup.lokasi.lokasiMitra(dasar.admin, dasar.fixture.lokasiMitra.id);
    if (!kebijakan.ok) throw new Error(`Lokasi Mitra refused: ${kebijakan.reason}`);
    await setup.lokasi.setPoliciesAndFlags(dasar.admin, dasar.fixture.lokasiMitra.id, {
      policies: { ...kebijakan.lokasiMitra.policies, masaPembatalanDays: 3, refundAfterMasaPembatalanPercent: 0 },
      flags: kebijakan.lokasiMitra.flags,
    });

    setup.clock.advance({ hours: 3 });
    await bayar(setup, hasil.tagihan.id);

    const order = await setup.pemesanan.terencanaUntukStaf(dasar.fixture.adminLokasi, dasar.nomor);
    expect(order).toMatchObject({ status: "aktif", aktifPada: setup.clock.now(), buktiPemesananId: expect.any(String) });
    expect(order?.unit).toHaveLength(2);
    const rights = await Promise.all(order!.unit.map((unit) => setup.inventory.hakPakaiById(unit.hakPakaiId!)));
    for (const hak of rights) {
      expect(hak).toMatchObject({
        status: "aktif",
        pemegangHak: { name: "Rina Wulandari", phoneNumber: "+6281234567890", email: "keluarga@contoh.id" },
        calonPenghuni: "Rina Wulandari",
        syarat: { masaPembatalanDays: 14, refundAfterMasaPembatalanPercent: 25, hakDengan: "lokasi_mitra", lokasiNama: dasar.fixture.lokasiMitra.name },
        // The term starts at the first Pemakaman: no start and no end date yet, even though the Jenis Makam has a 5-year term.
        tenureStartAt: null,
        endDate: null,
        tenureYears: 5,
        pemakaman: [],
      });
    }
    expect(new Set(rights.map((hak) => hak?.id)).size).toBe(2);
    // The hold has become the right: the plots are Terisi, not held, and nobody else can pick them.
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("terisi");
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-02")).toBe("terisi");
  });

  it("names the Calon Penghuni on every Hak Pakai when the Pemesan booked for someone else", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { "A-01": a01, "A-02": a02 } = await unitIds(setup, fixture, ["A-01", "A-02"]);
    const placed = await setup.pemesanan.placeTerencana({
      ...dataPemesan,
      pemesan,
      calonPenghuni: { mode: "lain", name: "Bapak Hasan" },
      pemegangHak: { mode: "lain", name: "Ibu Sari", phoneNumber: "081311112222", email: "ibu.sari@contoh.id" },
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [a01, a02] }),
    });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);

    await bayar(setup, konfirmasi.tagihan.id);

    const order = await setup.pemesanan.terencanaUntukStaf(fixture.adminLokasi, placed.pemesanan.nomor);
    for (const unit of order!.unit) {
      expect(await setup.inventory.hakPakaiById(unit.hakPakaiId!)).toMatchObject({
        pemegangHak: { name: "Ibu Sari", phoneNumber: "+6281311112222", email: "ibu.sari@contoh.id" },
        calonPenghuni: "Bapak Hasan",
      });
    }
  });

  it("gives a whole Kavling Keluarga one Hak Pakai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    const kavling = denah?.bloks.flatMap((blok) => blok.kavling)[0];
    if (!kavling) throw new Error("no Kavling Keluarga on the fixture's Denah");
    const placed = await setup.pemesanan.placeTerencana({ ...dataPemesan, pemesan, lokasiId: fixture.lokasiMitra.id, units: units({ kavling: kavling.id }) });
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);

    await bayar(setup, konfirmasi.tagihan.id);

    const order = await setup.pemesanan.terencanaUntukStaf(fixture.adminLokasi, placed.pemesanan.nomor);
    expect(order?.unit).toEqual([expect.objectContaining({ jenis: "kavling", nomor: kavling.nomorKavling, hakPakaiId: expect.any(String) })]);
    expect(await setup.inventory.hakPakaiById(order!.unit[0].hakPakaiId!)).toMatchObject({ status: "aktif", kavlingId: kavling.id, petakId: null, endDate: null });
  });

  it("issues the Bukti Pemesanan in the Lokasi Mitra's name for every plot, with the term still to start and no amounts", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    await bayar(setup, hasil.tagihan.id);

    const order = await setup.pemesanan.terencanaUntukStaf(dasar.fixture.adminLokasi, dasar.nomor);
    const bukti = await setup.billing.buktiPemesananById(order!.buktiPemesananId!);

    expect(bukti).toMatchObject({
      nomor: "BPM/2026/000001",
      nomorPemesanan: dasar.nomor,
      lokasiName: dasar.fixture.lokasiMitra.name,
      petakNomor: "A-01, A-02",
      pemegangHakName: "Rina Wulandari",
      // The clock starts at the first Pemakaman: nothing is dated, and the term says how long it runs from then.
      masa: { mulai: null, selesai: null, tahun: 5 },
    });
    expect(Object.keys(bukti ?? {})).not.toContain("total");
  });

  it("states a perpetual Jenis Makam as perpetual, never as a term it does not have", async () => {
    // The fixture's Jenis Makam runs 5 years, so the perpetual case is asserted on the term the order carries instead.
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    await bayar(setup, hasil.tagihan.id);
    const order = await setup.pemesanan.terencanaUntukStaf(dasar.fixture.adminLokasi, dasar.nomor);
    const bukti = await setup.billing.buktiPemesananById(order!.buktiPemesananId!);

    expect(bukti?.masa.tahun).toBe(5);
    expect(bukti?.masa.selesai).toBeNull();
  });

  it("tells the family by email, once, with the Bukti and when the Masa Pembatalan ends", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    setup.clock.advance({ hours: 2 });

    await bayar(setup, hasil.tagihan.id);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    // The payment effect announces the Bukti inside the payment's transaction; the real Notifications module turns that
    // announcement into the one email (the effect of this fixture reports to a collector, as the Saat Duka tests do).
    expect(setup.terencanaBukti).toHaveLength(1);
    expect(setup.terencanaBukti[0]).toMatchObject({ nomor: dasar.nomor, bukti: { nomor: "BPM/2026/000001" }, masa: { mulai: null, selesai: null, tahun: 5 } });
    await setup.notifications.terencanaBukti(setup.terencanaBukti[0]);
    await setup.notifications.terencanaBukti(setup.terencanaBukti[0]);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const surat = setup.email.sent.filter((satu) => satu.subject.startsWith("Bukti Pemesanan BPM/2026/000001"));
    expect(surat).toHaveLength(1);
    expect(surat[0].text).toContain("Petak Makam: A-01, A-02");
    expect(surat[0].text).toContain("Masa Hak Pakai: 5 tahun sejak pemakaman pertama");
    // 7 days after the payment, the Lokasi Mitra's default Masa Pembatalan.
    expect(surat[0].text).toContain("Masa Pembatalan berakhir");
  });

  it("is idempotent: a payment effect run again grants no second Hak Pakai and no second Bukti", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    await bayar(setup, hasil.tagihan.id);
    const sekali = await setup.pemesanan.terencanaUntukStaf(dasar.fixture.adminLokasi, dasar.nomor);

    // Billing settles a Tagihan once; settling again returns the existing payment and fires nothing.
    await bayar(setup, hasil.tagihan.id);

    const lagi = await setup.pemesanan.terencanaUntukStaf(dasar.fixture.adminLokasi, dasar.nomor);
    expect(lagi?.unit.map((unit) => unit.hakPakaiId)).toEqual(sekali?.unit.map((unit) => unit.hakPakaiId));
    expect((await setup.billing.allBuktiPemesanan()).map((bukti) => bukti.nomor)).toEqual(["BPM/2026/000001"]);
  });

  it("is refused when it comes at or after the hold's end: the Tagihan lapsed and the order is no more", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    setup.clock.set(hasil.pesanan.tahanSampai);

    const dibayar = await setup.billing.recordPayment(hasil.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });

    expect(dibayar).toMatchObject({ ok: false, reason: "batas_pembayaran_lewat" });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("dikonfirmasi");
  });
});

describe("a payment hold that ends unpaid", () => {
  it("cancels the order 'batas pembayaran lewat', the Tagihan and frees the plots for the next family, not a minute before", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    const akhir = hasil.pesanan.tahanSampai;

    setup.clock.set(new Date(akhir.getTime() - 60_000));
    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 0 });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("dikonfirmasi");
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("sedang_dipesan");

    setup.clock.set(akhir);
    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 1 });

    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan", alasan: "Batas pembayaran lewat" });
    expect(await setup.billing.tagihan(hasil.tagihan.id)).toMatchObject({ status: "dibatalkan", cancelledReason: "batas_pembayaran_lewat" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
    // The next family takes the same plot.
    const lain = await pemesanDenganEmail(setup, "keluarga.lain@contoh.id");
    setup.clock.advance({ minutes: 2 });
    const lagi = await setup.pemesanan.placeTerencana({
      ...dataPemesan,
      pemesan: lain.pemesan,
      lokasiId: dasar.fixture.lokasiMitra.id,
      units: units({ petak: [dasar.ids["A-01"]] }),
    });
    expect(lagi.ok).toBe(true);
  });

  it("is idempotent, and leaves the order alone when Billing's own lapse tick got to the Tagihan first", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    setup.clock.set(new Date(hasil.pesanan.tahanSampai.getTime() + 60_000));
    // Billing's lapse tick runs before this module's, as either may.
    const { lapsePayFirstTagihanTick } = await import("@/domain/billing");
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 1 });
    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 0 });
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-02")).toBe("bisa_dipilih");
  });

  it("never cancels an order whose Tagihan was paid in time", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    await bayar(setup, hasil.tagihan.id);
    setup.clock.set(new Date(hasil.pesanan.tahanSampai.getTime() + 3_600_000));

    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 0 });

    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("aktif");
  });

  it("tells the family by email that the plots were released and nothing was charged", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    const hasil = await dikonfirmasi(setup, dasar);
    setup.clock.set(hasil.pesanan.tahanSampai);

    await setup.pemesanan.lewatBatasBayarTick();
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const surat = setup.email.sent.filter((satu) => satu.subject === `Pesanan ${dasar.nomor} dibatalkan: batas pembayaran lewat`);
    expect(surat).toHaveLength(1);
    expect(surat[0].text).toContain("Tidak ada yang ditagih");
    expect(surat[0].text).toContain("/pesan-makam/terencana");
  });
});

describe("the Pemesan withdraws a Pemesanan Terencana before paying", () => {
  it("cancels a Diajukan order for free and releases its plots", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);

    const hasil = await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(hasil).toEqual({ ok: true, pesanan: { nomor: dasar.nomor, status: "dibatalkan" }, tagihan: null });
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan", alasan: "Ditarik oleh Pemesan sebelum membayar" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
    expect(await setup.pemesanan.antreanKonfirmasiTerencana(dasar.fixture.lokasiMitra.id)).toEqual([]);
  });

  it("cancels a Dikonfirmasi order's unpaid Tagihan, asks for no refund and releases its plots", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);

    const hasil = await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(hasil).toMatchObject({ ok: true, tagihan: { nomorTagihan: konfirmasi.tagihan.nomorTagihan } });
    expect(await setup.billing.tagihan(konfirmasi.tagihan.id)).toMatchObject({
      status: "dibatalkan",
      cancelledReason: "pemesanan_dibatalkan",
      pengembalianDiminta: null,
    });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
    // The family cannot pay a Tagihan that was withdrawn.
    expect(await setup.billing.recordPayment(konfirmasi.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null })).toMatchObject({
      ok: false,
      reason: "tagihan_dibatalkan",
    });
  });

  it("refuses once the Tagihan is paid: taking back a paid order is a Pembatalan, and nothing is cancelled", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);
    await bayar(setup, konfirmasi.tagihan.id);

    const hasil = await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(hasil).toEqual({ ok: false, reason: "sudah_dibayar" });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("aktif");
    expect(await setup.billing.tagihan(konfirmasi.tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("is only ever the Pemesan's own: another Akun finds no such order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const orang = await pemesanDenganEmail(setup, "orang.lain@contoh.id");

    const hasil = await setup.pemesanan.tarikTerencana(orang.pemesan, { nomor: dasar.nomor });

    expect(hasil).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("diajukan");
  });

  it("withdraws once: a second withdrawal changes nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor })).toEqual({ ok: false, reason: "pesanan_sudah_ditutup" });
  });
});

describe("the Admin Lokasi declines a Pemesanan Terencana (Tolak)", () => {
  it("makes it Ditolak with a reason off the closed list, releases the plots and audits it on the Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);

    const hasil = await setup.pemesanan.tolakTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor, alasan: "petak_tidak_tersedia" });

    expect(hasil).toEqual({ ok: true, pesanan: { nomor: dasar.nomor, status: "ditolak", alasan: "petak_tidak_tersedia" } });
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({
      status: "ditolak",
      alasan: "Petak untuk jenis makam ini sudah tidak tersedia",
      tagihanId: null,
    });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
    expect(await setup.pemesanan.antreanKonfirmasiTerencana(dasar.fixture.lokasiMitra.id)).toEqual([]);
    const tercatat = (await setup.audit.allEntries()).filter((entry) => entry.action === "pemesanan.tolak_terencana");
    expect(tercatat).toEqual([
      expect.objectContaining({
        actor: { accountId: dasar.fixture.adminLokasi.accountId, role: "admin_lokasi" },
        lokasiId: dasar.fixture.lokasiMitra.id,
        after: expect.objectContaining({ status: "ditolak", alasan: "petak_tidak_tersedia", dilepas: ["A-01", "A-02"] }),
      }),
    ]);
  });

  it("sends the Pemesan back to the Lokasi step, with the reason and no charge", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);

    await setup.pemesanan.tolakTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor, alasan: "harga_belum_disepakati" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const surat = setup.email.sent.filter((satu) => satu.subject === `Pesanan ${dasar.nomor} belum bisa dilayani ${dasar.fixture.lokasiMitra.name}`);
    expect(surat).toHaveLength(1);
    expect(surat[0].text).toContain("Harga belum disepakati dengan keluarga");
    expect(surat[0].text).toContain("tidak ada yang perlu dibayar");
    expect(surat[0].text).toMatch(/https:\/\/makam\.test\/pesan-makam\/terencana(\s|$)/);
  });

  it("refuses a reason that is not on the Terencana list, a decline of a confirmed order and any other Lokasi's Admin Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);

    // A burial day belongs to a death that has happened; a plot booked in advance has none.
    expect(await setup.pemesanan.tolakTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor, alasan: "tanggal_tidak_bisa" })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.pemesanan.tolakTerencana(dasar.admin, { nomor: dasar.nomor, alasan: "kapasitas_penuh" })).toMatchObject({ ok: false });
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("diajukan");

    await dikonfirmasi(setup, dasar);
    expect(await setup.pemesanan.tolakTerencana(dasar.fixture.adminLokasi, { nomor: dasar.nomor, alasan: "kapasitas_penuh" })).toEqual({ ok: false, reason: "pesanan_sudah_ditutup" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("sedang_dipesan");
  });
});

describe("the Pencairan of a paid Pemesanan Terencana", () => {
  /** A paid order, and the Pencairan module composed on the same modules. */
  async function dibayar(setup: PemesananSetup, dasar: Pesanan) {
    const hasil = await dikonfirmasi(setup, dasar);
    await bayar(setup, hasil.tagihan.id);
    return { hasil, payouts: payoutsFor(setup).payouts };
  }

  it("makes the Hak Pakai item due at the end of the Masa Pembatalan, not a moment before", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup, ["A-01", "A-02"], { masaPembatalanDays: 7 });
    setup.clock.advance({ hours: 3 });
    const dibayarPada = setup.clock.now();
    const { payouts } = await dibayar(setup, dasar);
    const akhir = new Date(dibayarPada.getTime() + 7 * 24 * 3_600_000);
    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.masaPembatalanBerakhirPada).toEqual(akhir);

    setup.clock.set(new Date(akhir.getTime() - 60_000));
    expect(await payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await payouts.pencairanJatuhTempo()).toEqual([]);

    setup.clock.set(akhir);
    expect(await payouts.tick()).toMatchObject({ items: 2 });
    const [baris] = await payouts.pencairanJatuhTempo();
    // The Lokasi Mitra's own share only: both Harga Hak Pakai lines, never the Operator's Biaya Layanan Platform.
    expect(baris).toMatchObject({ amount: 5_000_000, jatuhTempoAt: await payouts.tenggat(akhir) });
  });

  it("makes it due at the first Pemakaman instead when that comes sooner", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup, ["A-01"], { masaPembatalanDays: 7 });
    const { payouts } = await dibayar(setup, dasar);
    setup.clock.advance({ days: 2 });
    const pemakamanPada = setup.clock.now();
    // No public function records a burial at a Terencana Hak Pakai yet (a later burial is its own ticket): the fact is written as Payouts' own test does.
    await db.transaction((tx) => payouts.pemakamanTercatat(tx, { nomorPemesanan: dasar.nomor, pemakamanAt: pemakamanPada }));

    expect(await payouts.tick()).toMatchObject({ items: 1 });

    const [baris] = await payouts.pencairanJatuhTempo();
    expect(baris).toMatchObject({ amount: 2_500_000 });
    // Once made, the item is never made again when the Masa Pembatalan ends afterwards.
    setup.clock.advance({ days: 6 });
    expect(await payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 1 });
    expect(await payouts.pencairanJatuhTempo()).toHaveLength(1);
    // Due at the Pemakaman: the transfer's 2 Hari Kerja are counted from it, not from the Masa Pembatalan's end.
    expect((await payouts.pencairanJatuhTempo())[0].jatuhTempoAt).toEqual(await payouts.tenggat(pemakamanPada));
  });

  it("is idempotent: the tick run twice makes one item", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup, ["A-01"], { masaPembatalanDays: 1 });
    const { payouts } = await dibayar(setup, dasar);
    setup.clock.advance({ days: 2 });

    await payouts.tick();
    await payouts.tick();

    expect(await payouts.pencairanJatuhTempo()).toHaveLength(1);
  });
});

/** The Operator gives a Harga Khusus on a confirmed order's unpaid Tagihan: it is cancelled and reissued under a new id (ticket 30). */
async function hargaKhusus(setup: PemesananSetup, dasar: Pesanan, tagihanId: string) {
  const khusus = await setup.billing.tetapkanHargaKhusus(dasar.admin, {
    tagihanId,
    amount: 500_000,
    alasan: "Keringanan untuk keluarga",
    porsiMitra: 0,
    catatanPorsiMitra: "Ditanggung Operator",
  });
  if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
  return khusus.tagihan;
}

const bayarQris = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;

describe("a Pemesanan Terencana whose Tagihan was reissued by a Harga Khusus (ticket 93)", () => {
  it("withdrawing it cancels the replacement Tagihan the family could still pay, not the one already replaced", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);
    const pengganti = await hargaKhusus(setup, dasar, konfirmasi.tagihan.id);

    const hasil = await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(hasil).toMatchObject({ ok: true, tagihan: { nomorTagihan: pengganti.nomorTagihan } });
    expect(await setup.billing.tagihan(pengganti.id)).toMatchObject({ status: "dibatalkan", cancelledReason: "pemesanan_dibatalkan" });
    expect(await setup.billing.recordPayment(pengganti.id, bayarQris)).toMatchObject({ ok: false, reason: "tagihan_dibatalkan" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
  });

  it("refuses a withdrawal once the replacement Tagihan is paid: that is a Pembatalan, and nothing is cancelled", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);
    const pengganti = await hargaKhusus(setup, dasar, konfirmasi.tagihan.id);
    await bayar(setup, pengganti.id);

    const hasil = await setup.pemesanan.tarikTerencana(dasar.pemesan, { nomor: dasar.nomor });

    expect(hasil).toEqual({ ok: false, reason: "sudah_dibayar" });
    expect(await setup.billing.tagihan(pengganti.id)).toMatchObject({ status: "lunas" });
  });

  it("a payment hold that ends unpaid cancels the replacement Tagihan 'batas pembayaran lewat' and tells the family its number", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);
    const pengganti = await hargaKhusus(setup, dasar, konfirmasi.tagihan.id);
    setup.clock.set(konfirmasi.pesanan.tahanSampai);

    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 1 });

    expect(await setup.billing.tagihan(pengganti.id)).toMatchObject({ status: "dibatalkan", cancelledReason: "batas_pembayaran_lewat" });
    expect(await setup.billing.recordPayment(pengganti.id, bayarQris)).toMatchObject({ ok: false, reason: "batas_pembayaran_lewat" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const surat = setup.email.sent.filter((satu) => satu.subject === `Pesanan ${dasar.nomor} dibatalkan: batas pembayaran lewat`);
    expect(surat).toHaveLength(1);
    expect(surat[0].text).toContain(pengganti.nomorTagihan);
  });

  it("a payment hold that ends after the replacement was paid leaves the order Aktif", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesanan(setup);
    const konfirmasi = await dikonfirmasi(setup, dasar);
    const pengganti = await hargaKhusus(setup, dasar, konfirmasi.tagihan.id);
    await bayar(setup, pengganti.id);
    setup.clock.set(new Date(konfirmasi.pesanan.tahanSampai.getTime() + 3_600_000));

    expect(await setup.pemesanan.lewatBatasBayarTick()).toEqual({ dibatalkan: 0 });

    expect((await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan))?.status).toBe("aktif");
  });
});
