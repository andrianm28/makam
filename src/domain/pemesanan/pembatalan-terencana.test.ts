/**
 * The Pembatalan of a paid Pemesanan Terencana (spec, Pemesanan > Requests from the Pemegang Hak; Work
 * Queues: the Antrean Lokasi row and Admin Platform's Tier 3 "Pembatalan refund approval"; stories 102,
 * 107 and 125; ticket 38's ACs), driven only through the public interfaces of Pemesanan, Refunds,
 * Payouts, Billing, Inventory and the Antrean, on the real Postgres with the fake Clock.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { inventoryPemegangHak } from "@/domain/inventory/schema";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf, logIn } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { buktiTransfer } from "../../../tests/support/refunds";
import { terencanaLokasi, type TerencanaOptions } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Rina Wulandari" };

/** The signed-in Pemesan of a fixture, as the guard would hand it to Refunds. */
function sebagaiActor(pemesan: { accountId: string; email: string }): Actor {
  return { ...pemesan, phoneNumber: null, roles: ["pemesan"], lokasiIds: [], totp: "tidak_perlu", sessionId: "sesi-uji" };
}

interface OpsiPesanan extends TerencanaOptions {
  /** Who holds the Hak Pakai: the Pemesan themselves (default), or a relative with an Akun of their own. */
  pemegangHak?: "pemesan" | "lain";
  nomorPetak?: string[];
}

/**
 * A Pemesanan Terencana placed at Thursday 2026-10-01 09:00, confirmed, and paid at 10:00: Aktif, with its
 * Masa Pembatalan running from that payment. 2 Petak at Rp 2.500.000 and the Rp 150.000 Biaya Layanan Platform.
 */
async function pesananAktif(setup: PemesananSetup, opsi: OpsiPesanan = {}) {
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup);
  const fixture = await terencanaLokasi(setup, admin, { masaPembatalanDays: 7, refundPercent: 40, ...opsi });
  const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
  const pemegang = opsi.pemegangHak === "lain" ? (await pemesanDenganEmail(setup, "ibu.sari@contoh.id")).pemesan : pemesan;
  const nomorPetak = opsi.nomorPetak ?? ["A-01", "A-02"];
  const id = await unitIds(setup, fixture, nomorPetak);
  const placed = await setup.pemesanan.placeTerencana({
    pemesanName: "Rina Wulandari",
    phoneNumber: "081234567890",
    pemegangHak:
      opsi.pemegangHak === "lain" ? { mode: "lain", name: "Ibu Sari", phoneNumber: "081311112222", email: "ibu.sari@contoh.id" } : { mode: "pemesan" },
    calonPenghuni: { mode: "saya" },
    pemesan,
    lokasiId: fixture.lokasiMitra.id,
    units: nomorPetak.map((nomor) => ({ petakId: id[nomor] })),
  });
  if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
  const nomor = placed.pemesanan.nomor;
  const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor });
  if (!konfirmasi.ok) throw new Error(`konfirmasiTerencana refused: ${JSON.stringify(konfirmasi)}`);
  setup.clock.advance({ hours: 1 });
  const dibayar = await setup.billing.recordPayment(konfirmasi.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  const order = await setup.pemesanan.terencanaUntukStaf(fixture.adminLokasi, nomor);
  if (order?.status !== "aktif") throw new Error(`the paid order is ${order?.status}`);
  return {
    admin,
    fixture,
    pemesan,
    pemegang,
    nomor,
    tagihanId: konfirmasi.tagihan.id,
    hakPakaiIds: order.unit.map((unit) => unit.hakPakaiId!),
    dibayarPada: setup.clock.now(),
    masaBerakhirPada: order.masaPembatalanBerakhirPada!,
  };
}

type Aktif = Awaited<ReturnType<typeof pesananAktif>>;

/** The Pemegang Hak asks; the request must be accepted. */
async function ajukan(setup: PemesananSetup, dasar: Aktif, catatan = "") {
  const hasil = await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0], catatan });
  if (!hasil.ok) throw new Error(`ajukanPembatalanTerencana refused: ${hasil.reason}`);
  return hasil.permintaan;
}

/** The Admin Lokasi approves; the approval must be accepted. */
async function setujui(setup: PemesananSetup, dasar: Aktif, id: string) {
  const hasil = await setup.pemesanan.setujuiPembatalanTerencana(dasar.fixture.adminLokasi, { id });
  if (!hasil.ok) throw new Error(`setujuiPembatalanTerencana refused: ${hasil.reason}`);
  return hasil;
}

async function statusPetak(setup: PemesananSetup, lokasiId: string, nomor: string) {
  const denah = await setup.inventory.publicDenah(lokasiId);
  return denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomor)?.status;
}

/** The rows Admin Platform's Antrean shows of this ticket. */
async function barisRefund(setup: PemesananSetup, admin: Actor) {
  return (await setup.queues.antrean(admin)).filter((row) => row.type === "pembatalan_refund");
}

/** The rows the Antrean Lokasi shows of this ticket. */
async function barisPembatalan(setup: PemesananSetup, dasar: Aktif) {
  const antrean = await setup.queues.antreanLokasi(dasar.fixture.adminLokasi, dasar.fixture.lokasiMitra.id);
  return [...antrean.mendesak, ...antrean.lainnya].filter((row) => row.type === "pembatalan_terencana");
}

describe('"Ajukan Pembatalan" shows the refund under the order\'s own Syarat before it is asked', () => {
  it("refunds the whole tariff inside the Masa Pembatalan and never the Biaya Layanan Platform", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);

    const hasil = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);

    if (!hasil.ok) throw new Error(hasil.reason);
    expect(hasil.pembatalan).toMatchObject({
      nomor: dasar.nomor,
      unit: [expect.objectContaining({ nomor: "A-01" }), expect.objectContaining({ nomor: "A-02" })],
      syarat: { masaPembatalanDays: 7, refundAfterMasaPembatalanPercent: 40 },
      masaPembatalanBerakhirPada: dasar.masaBerakhirPada,
      permintaan: null,
      bisaMengajukan: {
        ok: true,
        refund: { dalamMasaPembatalan: true, persenRefund: 100, tarif: 5_000_000, biayaLayananPlatform: 150_000, jumlahRefund: 5_000_000 },
      },
    });
  });

  it("refunds the set share after the Masa Pembatalan, from the Syarat snapshot and not the Lokasi's policy of today", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    // The Lokasi Mitra is more generous now; this family agreed to 40%.
    const kebijakan = await setup.lokasi.lokasiMitra(dasar.admin, dasar.fixture.lokasiMitra.id);
    if (!kebijakan.ok) throw new Error(kebijakan.reason);
    const diubah = await setup.lokasi.setPoliciesAndFlags(dasar.admin, dasar.fixture.lokasiMitra.id, {
      policies: { ...kebijakan.lokasiMitra.policies, masaPembatalanDays: 30, refundAfterMasaPembatalanPercent: 90 },
      flags: kebijakan.lokasiMitra.flags,
    });
    if (!diubah.ok) throw new Error(diubah.reason);

    // Strictly before the end: still the whole tariff. At the end: the set share.
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() - 1));
    const sebelum = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);
    expect(sebelum).toMatchObject({ ok: true, pembatalan: { bisaMengajukan: { ok: true, refund: { persenRefund: 100 } } } });
    setup.clock.set(dasar.masaBerakhirPada);
    const sesudah = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);

    expect(sesudah).toMatchObject({
      ok: true,
      pembatalan: {
        syarat: { masaPembatalanDays: 7, refundAfterMasaPembatalanPercent: 40 },
        bisaMengajukan: { ok: true, refund: { dalamMasaPembatalan: false, persenRefund: 40, jumlahRefund: 2_000_000, biayaLayananPlatform: 150_000 } },
      },
    });
  });

  it("is shown only to the Pemegang Hak of a Terencana Hak Pakai, never to the Pemesan who paid when somebody else holds it, nor to a stranger", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup, { pemegangHak: "lain" });
    const orangLain = (await pemesanDenganEmail(setup, "orang.lain@contoh.id")).pemesan;

    expect(await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0])).toMatchObject({ ok: true });
    expect(await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemesan, dasar.hakPakaiIds[0])).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.pemesanan.pratinjauPembatalanTerencana(orangLain, dasar.hakPakaiIds[0])).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemesan, { hakPakaiId: dasar.hakPakaiIds[0] })).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("is not offered once a Pemakaman is recorded under one of the order's Hak Pakai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const dicatat = await setup.inventory.catatPemakaman(dasar.fixture.adminLokasi, dasar.fixture.lokasiMitra.id, {
      hakPakaiId: dasar.hakPakaiIds[1],
      almarhumName: "Bapak Hasan",
      tanggal: "2026-10-01",
    });
    expect(dicatat.ok).toBe(true);

    const hasil = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);

    expect(hasil).toMatchObject({ ok: true, pembatalan: { bisaMengajukan: { ok: false, sebab: "sudah_ada_pemakaman" } } });
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0] })).toEqual({ ok: false, reason: "sudah_ada_pemakaman" });
    expect(await barisPembatalan(setup, dasar)).toEqual([]);
  });

  it("is not offered after a Ganti Pemegang Hak, whichever Hak Pakai of the order it was on", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    // Ganti Pemegang Hak has no public function yet: the earlier holder's row is closed the way that ticket will close it.
    await db.update(inventoryPemegangHak).set({ endAt: setup.clock.now() }).where(eq(inventoryPemegangHak.hakPakaiId, dasar.hakPakaiIds[1]));
    await db.insert(inventoryPemegangHak).values({
      hakPakaiId: dasar.hakPakaiIds[1],
      name: "Ahli Waris",
      phoneNumber: "+6281200000000",
      email: "ahli.waris@contoh.id",
      startAt: setup.clock.now(),
      createdByAccountId: dasar.fixture.adminLokasi.accountId,
    });

    const hasil = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);

    expect(hasil).toMatchObject({ ok: true, pembatalan: { bisaMengajukan: { ok: false, sebab: "pernah_ganti_pemegang_hak" } } });
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0] })).toEqual({ ok: false, reason: "pernah_ganti_pemegang_hak" });
  });

  it("is not offered for an order that is not Aktif (one still awaiting payment has no Hak Pakai to cancel)", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const disetujui = await ajukan(setup, dasar);
    await setujui(setup, dasar, disetujui.id);

    const hasil = await setup.pemesanan.pratinjauPembatalanTerencana(dasar.pemegang, dasar.hakPakaiIds[0]);

    expect(hasil).toMatchObject({ ok: true, pembatalan: { bisaMengajukan: { ok: false, sebab: "pesanan_tidak_aktif" }, permintaan: { status: "disetujui" } } });
  });
});

describe("the Pembatalan request and its Antrean Lokasi row", () => {
  it("is Diajukan with the refund fixed at that moment, and its row is due in 2 Hari Kerja on the Lokasi's own calendar", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    // Thursday 2026-10-01 11:00: the Lokasi is open Monday to Saturday, so 2 Hari Kerja end Saturday 15:00.
    setup.clock.advance({ hours: 1 });

    const permintaan = await ajukan(setup, dasar, "Keluarga pindah kota");

    expect(permintaan).toMatchObject({
      nomor: dasar.nomor,
      status: "diajukan",
      dalamMasaPembatalan: true,
      persenRefund: 100,
      jumlahRefund: 5_000_000,
      catatanPemohon: "Keluarga pindah kota",
      putaran: 0,
      tenggatPada: wib("2026-10-03 15:00"),
    });
    expect(await barisPembatalan(setup, dasar)).toEqual([
      expect.objectContaining({
        type: "pembatalan_terencana",
        label: "Pembatalan",
        subjectKind: "permintaan_pembatalan_terencana",
        subjectLabel: `${dasar.nomor} · A-01, A-02`,
        href: `/staf/admin-lokasi/${dasar.fixture.lokasiMitra.id}/pesanan/${dasar.nomor}`,
        deadline: wib("2026-10-03 15:00"),
        pastDeadline: false,
      }),
    ]);
    // Nothing changed on the right yet: the plots are still the family's until the Lokasi answers.
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("terisi");
  });

  it("skips the Lokasi's closed Sunday: a request on a Friday is due the end of Monday", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    setup.clock.set(wib("2026-10-02 10:00"));

    const permintaan = await ajukan(setup, dasar);

    expect(permintaan.tenggatPada).toEqual(wib("2026-10-05 15:00"));
  });

  it("is asked once at a time, however many Hak Pakai the order has", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    await ajukan(setup, dasar);

    const lagi = await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[1] });

    expect(lagi).toEqual({ ok: false, reason: "sudah_ada_permintaan" });
    expect(await barisPembatalan(setup, dasar)).toHaveLength(1);
    expect(await setup.pemesanan.adaPembatalanTerbuka(dasar.hakPakaiIds[1])).toBe(true);
  });

  it("goes back for a fix (its row closes), is filed again with the same refund and a new deadline, and its row returns", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);

    const dikembalikan = await setup.pemesanan.mintaPerbaikanPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id, catatan: "Tolong tulis alasan pembatalan" });
    expect(dikembalikan).toMatchObject({ ok: true, permintaan: { status: "perlu_perbaikan", alasanKeputusan: "Tolong tulis alasan pembatalan", putaran: 1 } });
    expect(await barisPembatalan(setup, dasar)).toEqual([]);
    // Still open: the family cannot start a second request beside it, and a Ganti Pemegang Hak stays blocked.
    expect(await setup.pemesanan.adaPembatalanTerbuka(dasar.hakPakaiIds[0])).toBe(true);
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0] })).toEqual({ ok: false, reason: "sudah_ada_permintaan" });

    // The Lokasi took days to send it back: the family still gets the full refund of the day it asked.
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 24 * 3_600_000));
    const ulang = await setup.pemesanan.ajukanUlangPembatalanTerencana(dasar.pemegang, { id: permintaan.id, catatan: "Pindah ke luar kota" });

    expect(ulang).toMatchObject({
      ok: true,
      permintaan: { status: "diajukan", persenRefund: 100, jumlahRefund: 5_000_000, catatanPemohon: "Pindah ke luar kota", alasanKeputusan: null },
    });
    expect(await barisPembatalan(setup, dasar)).toHaveLength(1);
    // Friday 2026-10-09 10:00: Saturday is the first Hari Kerja, and the closed Sunday is skipped for Monday the 12th.
    expect((await barisPembatalan(setup, dasar))[0].deadline).toEqual(wib("2026-10-12 15:00"));
  });

  it("is withdrawn by the requester before a decision, its row is gone and nothing on the right changed", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup, { pemegangHak: "lain" });
    const permintaan = await ajukan(setup, dasar);

    // Only the Akun that asked: the Pemesan who paid may not withdraw it for them.
    expect(await setup.pemesanan.batalkanPermintaanPembatalanTerencana(dasar.pemesan, { id: permintaan.id })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    const dibatalkan = await setup.pemesanan.batalkanPermintaanPembatalanTerencana(dasar.pemegang, { id: permintaan.id });

    expect(dibatalkan).toMatchObject({ ok: true, permintaan: { status: "dibatalkan" } });
    expect(await barisPembatalan(setup, dasar)).toEqual([]);
    expect(await setup.pemesanan.adaPembatalanTerbuka(dasar.hakPakaiIds[0])).toBe(false);
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("terisi");
    // A withdrawn request is decided: the Admin Lokasi can no longer approve it, and the family may ask again.
    expect(await setup.pemesanan.setujuiPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id })).toEqual({ ok: false, reason: "sudah_diputuskan" });
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0] })).toMatchObject({ ok: true });
  });
});

describe("the Admin Lokasi confirms there is no Pemakaman", () => {
  it("ends every Hak Pakai of the order, frees its Petak and cancels the order, in one audited step", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    setup.clock.advance({ hours: 20 });

    const hasil = await setujui(setup, dasar, permintaan.id);

    expect(hasil.permintaan).toMatchObject({ status: "disetujui", diputuskanPada: setup.clock.now() });
    for (const hakPakaiId of dasar.hakPakaiIds) {
      expect(await setup.inventory.hakPakaiById(hakPakaiId)).toMatchObject({ status: "dibatalkan" });
    }
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-02")).toBe("bisa_dipilih");
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan", alasan: "Pembatalan disetujui Lokasi Mitra" });
    expect(await barisPembatalan(setup, dasar)).toEqual([]);
    const tercatat = (await setup.audit.allEntries()).filter((entry) => entry.action === "pembatalan_terencana.setujui");
    expect(tercatat).toEqual([
      expect.objectContaining({
        actor: { accountId: dasar.fixture.adminLokasi.accountId, role: "admin_lokasi" },
        lokasiId: dasar.fixture.lokasiMitra.id,
        before: { status: "diajukan", pesanan: "aktif" },
        after: expect.objectContaining({ status: "disetujui", pesanan: "dibatalkan", persenRefund: 100, jumlahRefund: 5_000_000, unit: ["A-01", "A-02"] }),
      }),
    ]);
  });

  it("asks Refunds for the refund in the same step: the whole tariff inside the Masa Pembatalan, the Biaya Layanan Platform kept, and a Tier 3 row due in 2 Hari Kerja", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    // Friday 2026-10-02 10:00: 2 Hari Kerja on Admin Platform's Monday-Friday calendar end Tuesday 23:59.
    setup.clock.set(wib("2026-10-02 10:00"));
    expect(await barisRefund(setup, dasar.admin)).toEqual([]);

    const hasil = await setujui(setup, dasar, permintaan.id);

    const refund = await setup.refunds.permintaanUntukPesanan(dasar.nomor);
    expect(refund).toMatchObject({
      id: hasil.pengembalian?.permintaanId,
      status: "diajukan",
      nomorPemesanan: dasar.nomor,
      jumlah: 5_000_000,
      pihakBersalah: "pemesan",
      biayaLayananPlatformDikembalikan: false,
      penuh: true,
      goodwill: false,
    });
    expect(await barisRefund(setup, dasar.admin)).toEqual([
      expect.objectContaining({
        type: "pembatalan_refund",
        tier: 3,
        label: "Pembatalan refund approval",
        subjectLabel: expect.stringContaining(dasar.nomor),
        deadline: wib("2026-10-06 23:59"),
        href: "/staf/admin-platform/pengembalian",
      }),
    ]);

    // Admin Platform approves the refund: the row closes, and Refunds' own "refund transfer" row takes over.
    const setuju = await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: refund!.id });
    expect(setuju.ok).toBe(true);
    expect(await barisRefund(setup, dasar.admin)).toEqual([]);
  });

  it("refunds the set share after the Masa Pembatalan: a partial refund, the Tagihan Dikembalikan sebagian", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    const permintaan = await ajukan(setup, dasar);
    expect(permintaan).toMatchObject({ dalamMasaPembatalan: false, persenRefund: 40, jumlahRefund: 2_000_000 });
    const hasil = await setujui(setup, dasar, permintaan.id);

    const refund = await setup.refunds.permintaan(hasil.pengembalian!.permintaanId);
    expect(refund).toMatchObject({ jumlah: 2_000_000, penuh: false, biayaLayananPlatformDikembalikan: false });
    await setup.refunds.isiRekeningPemesan(sebagaiActor(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening });
    await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: refund!.id });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(dasar.admin, {
      permintaanId: refund!.id,
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({ ok: true, bukti: { amount: 2_000_000, biayaLayananPlatformDikembalikan: false, rekening } });
    expect(await setup.billing.tagihan(dasar.tagihanId)).toMatchObject({ status: "dikembalikan_sebagian" });
  });

  it("refunds nothing when the Syarat gives 0% after the Masa Pembatalan: the right still ends, and no refund row is raised", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup, { refundPercent: 0 });
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    const permintaan = await ajukan(setup, dasar);
    expect(permintaan).toMatchObject({ persenRefund: 0, jumlahRefund: 0 });

    const hasil = await setujui(setup, dasar, permintaan.id);

    expect(hasil.pengembalian).toBeNull();
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toBeNull();
    expect(await barisRefund(setup, dasar.admin)).toEqual([]);
    expect(await setup.inventory.hakPakaiById(dasar.hakPakaiIds[0])).toMatchObject({ status: "dibatalkan" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("bisa_dipilih");
  });

  it("is refused, and changes nothing, when a Pemakaman was recorded after the request was made", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    await setup.inventory.catatPemakaman(dasar.fixture.adminLokasi, dasar.fixture.lokasiMitra.id, {
      hakPakaiId: dasar.hakPakaiIds[1],
      almarhumName: "Bapak Hasan",
      tanggal: "2026-10-01",
    });

    const hasil = await setup.pemesanan.setujuiPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id });

    expect(hasil).toEqual({ ok: false, reason: "sudah_ada_pemakaman" });
    expect(await setup.inventory.hakPakaiById(dasar.hakPakaiIds[0])).toMatchObject({ status: "aktif" });
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "aktif" });
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toBeNull();
    expect((await barisPembatalan(setup, dasar))).toHaveLength(1);
  });

  it("is refused, and changes nothing at all, when Refunds cannot take the refund (another refund of the Tagihan is open)", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    const goodwill = await setup.refunds.ajukanGoodwill(dasar.admin, {
      tagihanId: dasar.tagihanId,
      nomorTagihan: "TGH",
      nomorPemesanan: dasar.nomor,
      jumlah: 100_000,
      catatan: "Uji",
    });
    expect(goodwill.ok).toBe(true);

    const hasil = await setup.pemesanan.setujuiPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id });

    expect(hasil).toEqual({ ok: false, reason: "pengembalian_tidak_bisa_diajukan" });
    for (const hakPakaiId of dasar.hakPakaiIds) expect(await setup.inventory.hakPakaiById(hakPakaiId)).toMatchObject({ status: "aktif" });
    expect(await setup.pemesanan.terencanaOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "aktif" });
    expect((await barisPembatalan(setup, dasar))).toHaveLength(1);
    expect((await setup.audit.allEntries()).filter((entry) => entry.action === "pembatalan_terencana.setujui")).toEqual([]);
  });

  it("is that Lokasi's own Admin Lokasi's to answer, and nobody else's, Admin Platform included", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    const lain = await setup.lokasi.createLokasiMitra(dasar.admin, {
      name: "Makam Lain",
      pengelolaName: "Yayasan Lain",
      address: "Jl. Lain No. 2",
      city: "Kota Jakarta Timur",
    });
    if (!lain.ok) throw new Error(lain.reason);
    const undangan = await setup.lokasi.inviteAdminLokasi(dasar.admin, lain.lokasiMitra.id, { email: "admin.makam.lain@contoh.id", phoneNumber: "083377778888" });
    if (!undangan.ok) throw new Error(undangan.reason);
    const adminLain = await setup.identity.actorFromCookies((await logIn(setup, "admin.makam.lain@contoh.id")).cookies);
    if (!adminLain) throw new Error("not signed in");

    for (const oleh of [dasar.admin, adminLain, sebagaiActor(dasar.pemegang)]) {
      expect(await setup.pemesanan.setujuiPembatalanTerencana(oleh, { id: permintaan.id })).toMatchObject({ ok: false });
      expect(await setup.pemesanan.tolakPembatalanTerencana(oleh, { id: permintaan.id, alasan: "Tidak boleh" })).toMatchObject({ ok: false });
      expect(await setup.pemesanan.mintaPerbaikanPembatalanTerencana(oleh, { id: permintaan.id, catatan: "Perbaiki" })).toMatchObject({ ok: false });
    }
    expect((await barisPembatalan(setup, dasar))).toHaveLength(1);
    expect((await setup.audit.allEntries()).filter((entry) => entry.action.startsWith("pembatalan_terencana."))).toEqual([]);
  });

  it("answers once: a second approval or a decline of an approved request changes nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    await setujui(setup, dasar, permintaan.id);

    expect(await setup.pemesanan.setujuiPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id })).toEqual({ ok: false, reason: "sudah_diputuskan" });
    expect(await setup.pemesanan.tolakPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id, alasan: "Terlambat" })).toEqual({ ok: false, reason: "sudah_diputuskan" });
    expect((await setup.refunds.permintaanTerbuka()).filter((refund) => refund.nomorPemesanan === dasar.nomor)).toHaveLength(1);
  });
});

describe("declining a Pembatalan", () => {
  it("changes nothing on the Hak Pakai, is audited with its reason, and tells the family why", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);

    const hasil = await setup.pemesanan.tolakPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id, alasan: "Sudah ada pemakaman yang belum tercatat" });

    expect(hasil).toMatchObject({ ok: true, permintaan: { status: "ditolak", alasanKeputusan: "Sudah ada pemakaman yang belum tercatat" } });
    expect(await setup.inventory.hakPakaiById(dasar.hakPakaiIds[0])).toMatchObject({ status: "aktif" });
    expect(await statusPetak(setup, dasar.fixture.lokasiMitra.id, "A-01")).toBe("terisi");
    expect(await barisPembatalan(setup, dasar)).toEqual([]);
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toBeNull();
    expect(setup.pembatalanTerencana).toEqual([
      expect.objectContaining({ peristiwa: "ditolak", email: "keluarga@contoh.id", nomor: dasar.nomor, alasan: "Sudah ada pemakaman yang belum tercatat" }),
    ]);
    expect((await setup.audit.allEntries()).filter((entry) => entry.action === "pembatalan_terencana.tolak")).toEqual([
      expect.objectContaining({ lokasiId: dasar.fixture.lokasiMitra.id, reason: "Sudah ada pemakaman yang belum tercatat", after: { status: "ditolak", nomorPemesanan: dasar.nomor } }),
    ]);
    // A declined request is over: the family may ask again.
    expect(await setup.pemesanan.ajukanPembatalanTerencana(dasar.pemegang, { hakPakaiId: dasar.hakPakaiIds[0] })).toMatchObject({ ok: true });
  });

  it("needs a reason", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);

    expect(await setup.pemesanan.tolakPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id, alasan: "  " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.pemesanan.mintaPerbaikanPembatalanTerencana(dasar.fixture.adminLokasi, { id: permintaan.id, catatan: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
  });
});

describe("the refund goes to the Pemesan who paid, to a bank account that Pemesan enters", () => {
  it("is asked of the Pemesan by email (and on the order page), and of the Pemegang Hak who asked only that it goes to the Pemesan", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesananAktif(setup, { pemegangHak: "lain" });
    const permintaan = await ajukan(setup, dasar);

    await setujui(setup, dasar, permintaan.id);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const kePemesan = setup.email.sent.filter((surat) => surat.to === "keluarga@contoh.id" && surat.subject === `Pembatalan pesanan ${dasar.nomor} disetujui`);
    expect(kePemesan).toHaveLength(1);
    expect(kePemesan[0].text).toContain("Pengembalian dana: Rp 5.000.000");
    expect(kePemesan[0].text).toContain("Biaya Layanan Platform tidak dikembalikan");
    expect(kePemesan[0].text).toContain("isi rekening tujuan");
    expect(kePemesan[0].text).toContain(`/pesanan/${dasar.nomor}`);
    const kePemegang = setup.email.sent.filter((surat) => surat.to === "ibu.sari@contoh.id" && surat.subject === `Pembatalan pesanan ${dasar.nomor} disetujui`);
    expect(kePemegang).toHaveLength(1);
    expect(kePemegang[0].text).toContain("dikembalikan kepada Pemesan yang membayar");
    expect(kePemegang[0].text).not.toContain("Isi rekening di");
    // The order page's own read: the refund waits for its bank account, on the Pemesan's order only.
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toMatchObject({ status: "diajukan", rekening: null });
    expect(await setup.pemesanan.pembatalanUntukPesanan(dasar.pemesan, dasar.nomor)).toMatchObject({ status: "disetujui", jumlahRefund: 5_000_000 });
    expect(await setup.pemesanan.pembatalanUntukPesanan(dasar.pemegang, dasar.nomor)).toBeNull();
  });

  it("sends one email, not two, when the Pemesan is also the Pemegang Hak", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);

    await setujui(setup, dasar, permintaan.id);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(setup.email.sent.filter((surat) => surat.subject === `Pembatalan pesanan ${dasar.nomor} disetujui`)).toHaveLength(1);
  });

  it("goes to the account the Pemesan enters, never the Pemegang Hak's: only the Pemesan may enter it, and the Bukti carries it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup, { pemegangHak: "lain" });
    const permintaan = await ajukan(setup, dasar);
    const hasil = await setujui(setup, dasar, permintaan.id);
    const refundId = hasil.pengembalian!.permintaanId;

    // The Pemegang Hak asked, but the money is not theirs to route.
    expect(await setup.refunds.isiRekeningPemesan(sebagaiActor(dasar.pemegang), { nomorPemesanan: dasar.nomor, rekening: { ...rekening, nama: "Ibu Sari" } })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.refunds.isiRekeningPemesan(sebagaiActor(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening })).toMatchObject({ ok: true });
    await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: refundId });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(dasar.admin, {
      permintaanId: refundId,
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({ ok: true, bukti: { nomorPemesanan: dasar.nomor, amount: 5_000_000, biayaLayananPlatformDikembalikan: false, rekening } });
    expect(await setup.billing.tagihan(dasar.tagihanId)).toMatchObject({ status: "dikembalikan_penuh" });
  });
});

describe("the Lokasi Mitra's Pencairan of a cancelled Pemesanan Terencana", () => {
  /** Approved, the refund approved and transferred. */
  async function kembalikan(setup: PemesananSetup, dasar: Aktif, permintaanId: string) {
    const hasil = await setujui(setup, dasar, permintaanId);
    const refundId = hasil.pengembalian!.permintaanId;
    await setup.refunds.isiRekeningPemesan(sebagaiActor(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening });
    await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: refundId });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(dasar.admin, {
      permintaanId: refundId,
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    return terbit;
  }

  it("is never made for a Pembatalan inside the Masa Pembatalan: the whole tariff went back to the family", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    const permintaan = await ajukan(setup, dasar);
    await kembalikan(setup, dasar, permintaan.id);

    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    await setup.payouts.tick();

    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
    expect(await setup.payouts.potonganOfLokasi(dasar.fixture.lokasiMitra.id)).toEqual([]);
  });

  it("is cut by the refunded tariff when the Masa Pembatalan ended first, so only the share the Lokasi keeps is paid", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    // The Pencairan is due the moment the Masa Pembatalan ends, before the family even asks.
    await setup.payouts.tick();
    const permintaan = await ajukan(setup, dasar);
    await kembalikan(setup, dasar, permintaan.id);

    // 40% refunded of Rp 5.000.000: the Lokasi Mitra keeps 60%, and it was not yet paid, so no Potongan.
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([expect.objectContaining({ amount: 3_000_000 })]);
    expect(await setup.payouts.potonganOfLokasi(dasar.fixture.lokasiMitra.id)).toEqual([]);
  });

  it("becomes a Potongan of the refunded tariff, and no more, when it was already paid out", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup);
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    await setup.payouts.tick();
    const [baris] = await setup.payouts.jalankanPencairan(dasar.admin);
    const dicairkan = await setup.payouts.terbitkanBuktiPencairan(dasar.admin, {
      itemIds: baris.items.map((item) => item.id),
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });
    if (!dicairkan.ok) throw new Error(`Bukti Pencairan refused: ${dicairkan.reason}`);
    expect(await setup.payouts.potonganOfLokasi(dasar.fixture.lokasiMitra.id)).toEqual([]);

    const permintaan = await ajukan(setup, dasar);
    const terbit = await kembalikan(setup, dasar, permintaan.id);

    // Paid Rp 5.000.000, refunded 40% = Rp 2.000.000: the Lokasi Mitra owes back that much, not the whole payment.
    expect(await setup.payouts.potonganOfLokasi(dasar.fixture.lokasiMitra.id)).toEqual([
      expect.objectContaining({ amount: 2_000_000, alasanKind: "pengembalian_dana", status: "berjalan", tautan: expect.stringContaining(terbit.bukti.link) }),
    ]);
  });

  it("becomes a Potongan of the whole tariff when a full refund comes after it was paid out", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await pesananAktif(setup, { masaPembatalanDays: 7 });
    // The request is made inside the Masa Pembatalan, and the Admin Platform's transfer only comes after the payout.
    const permintaan = await ajukan(setup, dasar);
    const hasil = await setujui(setup, dasar, permintaan.id);
    setup.clock.set(new Date(dasar.masaBerakhirPada.getTime() + 60_000));
    await setup.payouts.tick();
    const [baris] = await setup.payouts.jalankanPencairan(dasar.admin);
    const dicairkan = await setup.payouts.terbitkanBuktiPencairan(dasar.admin, {
      itemIds: baris.items.map((item) => item.id),
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });
    if (!dicairkan.ok) throw new Error(`Bukti Pencairan refused: ${dicairkan.reason}`);

    await setup.refunds.isiRekeningPemesan(sebagaiActor(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening });
    await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: hasil.pengembalian!.permintaanId });
    await setup.refunds.terbitkanBuktiPengembalianDana(dasar.admin, {
      permintaanId: hasil.pengembalian!.permintaanId,
      ditransferPada: wibDateOf(setup.clock.now()),
      bukti: buktiTransfer,
    });

    expect(await setup.payouts.potonganOfLokasi(dasar.fixture.lokasiMitra.id)).toEqual([expect.objectContaining({ amount: 5_000_000, alasanKind: "pengembalian_dana" })]);
  });
});
