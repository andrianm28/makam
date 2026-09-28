/**
 * Paying a Pemesanan Terencana (spec, Pemesanan > Terencana: "Aktif (paid, one Hak
 * Pakai per Petak / Kavling Keluarga, same Pemegang Hak)"; ticket 37's AC 3).
 *
 * The transition runs in the worker tick that turns a settled payment into the order's
 * right, so this drives the payment through the real Billing module — which fires the
 * Pemesanan module's own payment effect in the very transaction that settles the
 * Tagihan — and then the tick, and reads the result back through the modules' public
 * reads: the family's own order, Inventory's own Hak Pakai read, and Billing's Bukti
 * Pemesanan. Nothing here asserts on a table or a private helper.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesananOnTestDatabase, siapkanOperatorPemesanan, pemesanDenganEmail, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { terencanaLokasi, type TerencanaOptions } from "../../../tests/support/terencana";
import type { HakPakaiDetail } from "@/domain/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const kirim = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" as const },
  calonPenghuni: { mode: "lain" as const, name: "Neneng Sutrisno" },
};

/** A Terencana-ready Lokasi Mitra, a Pemesan, and Pengaturan Operator (a Tagihan needs its header). */
async function siap(setup: PemesananSetup, options: TerencanaOptions = {}) {
  const admin = await siapkanOperatorPemesanan(setup);
  const fixture = await terencanaLokasi(setup, admin, options);
  const { pemesan } = await pemesanDenganEmail(setup, "kelarga.bayar@contoh.id");
  return { ...setup, admin, fixture, pemesan };
}
type Siap = Awaited<ReturnType<typeof siap>>;

/** Places an order, has its Lokasi confirm it, and pays the Tagihan the way a family does. */
async function terencanaDibayar(setup: Siap, pilihan: { petak?: string[]; kavling?: boolean } = {}) {
  const semua = await unitIds(setup, setup.fixture, [...(pilihan.petak ?? ["A-01", "A-02"]), ...(pilihan.kavling ? ["A-K01"] : [])]);
  const placed = await setup.pemesanan.placeTerencana({
    ...kirim,
    pemesan: setup.pemesan,
    lokasiId: setup.fixture.lokasiMitra.id,
    units: [
      ...(pilihan.petak ?? ["A-01", "A-02"]).map((nomor) => ({ petakId: semua[nomor]! })),
      ...(pilihan.kavling ? [{ kavlingId: semua["A-K01"]! }] : []),
    ],
  });
  if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
  const konfirmasi = await setup.pemesanan.konfirmasiTerencana(setup.fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
  if (!konfirmasi.ok) throw new Error(`konfirmasi refused: ${JSON.stringify(konfirmasi)}`);
  const dibayar = await setup.billing.recordPayment(konfirmasi.tagihan!.id, {
    method: { kind: "penyedia_pembayaran", channel: "QRIS" },
    reference: null,
  });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  return { nomor: placed.pemesanan.nomor, tagihanId: konfirmasi.tagihan!.id, semua };
}

/** The Hak Pakai of one Petak Makam, by the number the family knows it by, through Inventory's own read. */
function hakPakaiPetak(setup: Siap, nomor: string): Promise<HakPakaiDetail | null> {
  const semua = [...setup.fixture.sel.entries()].find(([satu]) => satu === nomor);
  if (!semua) throw new Error(`the fixture's Blok A has no Petak ${nomor}`);
  return setup.inventory.asStaff(setup.fixture.adminLokasi).hakPakaiOfPetak(setup.fixture.lokasiMitra.id, semua[1].id);
}

/** The Hak Pakai of one Kavling Keluarga, by its Nomor Kavling, through Inventory's own read. */
async function hakPakaiKavling(setup: Siap, nomor: string): Promise<HakPakaiDetail | null> {
  const denah = await setup.inventory.asStaff(setup.fixture.adminLokasi).blok(setup.fixture.lokasiMitra.id, setup.fixture.blok.id);
  const kavling = denah?.kavling.find((satu) => satu.nomorKavling === nomor);
  if (!kavling) throw new Error(`the fixture's Blok A has no Kavling Keluarga ${nomor}`);
  return setup.inventory.asStaff(setup.fixture.adminLokasi).hakPakaiOfKavling(setup.fixture.lokasiMitra.id, kavling.id);
}

describe("a paid Pemesanan Terencana becomes Aktif", () => {
  it("gives one Hak Pakai per chosen Petak, all with the same Pemegang Hak and Calon Penghuni", async () => {
    const setup = pemesananOnTestDatabase(db);
    const brasa = await siap(setup);
    const { nomor } = await terencanaDibayar(brasa, { petak: ["A-01", "A-02"] });

    expect(await brasa.pemesanan.tickTerencanaDibayar()).toMatchObject({ diaktifkan: 1, gagal: [] });
    expect((await brasa.pemesanan.terencanaOf(nomor, brasa.pemesan))?.status).toBe("aktif");

    // Two chosen plots, two Hak Pakai: never one covering both, never one for a plot that
    // was not chosen.
    const a01 = await hakPakaiPetak(brasa, "A-01");
    const a02 = await hakPakaiPetak(brasa, "A-02");
    expect(a01?.pemegangHak?.name).toBe("Rina Wulandari");
    expect(a02?.pemegangHak?.name).toBe("Rina Wulandari");
    expect(a01?.id).not.toBe(a02?.id);
    expect(await hakPakaiPetak(brasa, "A-07")).toBeNull();
    // The Calon Penghuni the order named is the label each plot carries.
    expect(a01?.calonPenghuni).toBe("Neneng Sutrisno");
    expect(a02?.calonPenghuni).toBe("Neneng Sutrisno");
    // A fixed-term Hak Pakai's end date stays empty until the first Pemakaman: the clock
    // starts there, and there has not been one (CONTEXT.md).
    expect(a01?.endDate).toBeNull();
    expect(a01?.tenureYears).toBe(5);
  });

  it("gives one Hak Pakai for a whole Kavling Keluarga, not one per member Petak", async () => {
    const setup = pemesananOnTestDatabase(db);
    const brasa = await siap(setup);
    const { nomor } = await terencanaDibayar(brasa, { petak: [], kavling: true });

    expect(await brasa.pemesanan.tickTerencanaDibayar()).toMatchObject({ diaktifkan: 1 });
    expect((await brasa.pemesanan.terencanaOf(nomor, brasa.pemesan))?.status).toBe("aktif");
    // A Kavling Keluarga is one indivisible unit under one Hak Pakai.
    expect(await hakPakaiKavling(brasa, "A-K01")).toMatchObject({
      pemegangHak: { name: "Rina Wulandari" },
      calonPenghuni: "Neneng Sutrisno",
    });
    // Its member Petak carry no Hak Pakai of their own.
    expect(await hakPakaiPetak(brasa, "A-05")).toBeNull();
  });

  it("issues the one Bukti Pemesanan: the right, in the Lokasi Mitra's name, carrying no amounts", async () => {
    const setup = pemesananOnTestDatabase(db);
    const brasa = await siap(setup);
    const { nomor } = await terencanaDibayar(brasa, { petak: ["A-01", "A-02"] });
    await brasa.pemesanan.tickTerencanaDibayar();

    const bukti = await brasa.billing.buktiPemesanan(nomor);
    expect(bukti).toMatchObject({
      nomor: "BPM/2026/000001",
      nomorPemesanan: nomor,
      lokasiNama: brasa.fixture.lokasiMitra.name,
      unit: [
        { jenis: "petak", nomor: "A-01", jenisMakamName: "Reguler 2 × 1 m" },
        { jenis: "petak", nomor: "A-02", jenisMakamName: "Reguler 2 × 1 m" },
      ],
      pemegangHak: { name: "Rina Wulandari" },
      calonPenghuni: "Neneng Sutrisno",
      // A fixed term of 5 years whose clock has not started: both dates are empty.
      masaHakPakai: { jenis: "tahun", years: 5, mulai: null, sampai: null },
    });
    // No amounts anywhere in the document: the Bukti Pembayaran is what shows the money.
    const isi = JSON.stringify(bukti);
    expect(isi).not.toContain("2500000");
    expect(isi).not.toContain("5150000");
  });

  it("issues one Bukti per order, however many times the tick runs or the payment arrives", async () => {
    const setup = pemesananOnTestDatabase(db);
    const brasa = await siap(setup);
    const { nomor, tagihanId } = await terencanaDibayar(brasa, { petak: ["A-01"] });
    await brasa.pemesanan.tickTerencanaDibayar();
    const pertama = await brasa.billing.buktiPemesanan(nomor);

    // The tick is idempotent: a second run finds the order `aktif`, which is what its
    // guard is, so it grants nothing and issues no second document.
    expect(await brasa.pemesanan.tickTerencanaDibayar()).toMatchObject({ diaktifkan: 0, gagal: [] });
    expect(await brasa.billing.buktiPemesanan(nomor)).toEqual(pertama);
    // And a second settle of the same Tagihan settles nothing new — Billing answers with
    // the payment's own existing Bukti Pembayaran — so no second payment effect fires and
    // the one Bukti Pemesanan stands.
    const lagi = await brasa.billing.recordPayment(tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    expect(lagi).toMatchObject({ ok: true, bukti: { reference: null } });
    await brasa.pemesanan.tickTerencanaDibayar();
    expect(await brasa.billing.buktiPemesanan(nomor)).toEqual(pertama);
  });

  it("releases the hold's plots to the new Hak Pakai, so the Denah shows them sold", async () => {
    const setup = pemesananOnTestDatabase(db);
    const brasa = await siap(setup);
    const { nomor } = await terencanaDibayar(brasa, { petak: ["A-01"] });
    await brasa.pemesanan.tickTerencanaDibayar();

    // The plot is no longer merely held: it is Terisi under the Hak Pakai the payment
    // granted, which is what makes it a family's grave rather than a reservation.
    const denah = await brasa.inventory.publicDenah(brasa.fixture.lokasiMitra.id);
    const status = (nomorPetak: string) =>
      denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomorPetak)?.status;
    expect(status("A-01")).toBe("terisi");
    expect((await brasa.pemesanan.terencanaOf(nomor, brasa.pemesan))?.unit.map((satu) => satu.nomor)).toEqual(["A-01"]);
  });
});
