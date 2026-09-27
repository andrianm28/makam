import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  newLayananFor,
  newLokasiMitra,
  publishedLokasiMitra,
  setLokasiMitraStatusForTest,
  signedInAdminPlatform,
  type LayananSetup,
} from "../../../tests/support/layanan";
import type { Actor } from "@/domain/identity";
import type { NewPaket } from "@/domain/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const now = () => wib("2026-10-01 09:00");

describe("the Paket Layanan Admin Platform defines", () => {
  it("are its items and a frequency, and the Audit Log keeps the change", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { varian: pembersihan } = await newLayananFor(setup, admin);
    const { varian: laporan } = await newLayananFor(setup, admin, { name: "Laporan Foto/Video", bukti: "foto_dan_video", leadTimeDays: 1 });

    const created = await setup.layanan.buatPaket(admin, {
      name: "Paket Ziarah",
      description: "Pembersihan dan laporan kondisi makam tiap bulan.",
      frekuensi: "bulanan",
      itemIds: [pembersihan.id, laporan.id],
      reason: " Paket v1 ",
    });
    if (!created.ok) throw new Error(`Paket refused: ${created.reason}`);
    expect(created.paket).toMatchObject({ name: "Paket Ziarah", frekuensi: "bulanan" });
    expect(created.paket.item.map((one) => [one.namaLayanan, one.name])).toEqual([
      ["Pembersihan Makam", "Reguler"],
      ["Laporan Foto/Video", "Reguler"],
    ]);
    expect(await setup.layanan.paket()).toMatchObject([{ name: "Paket Ziarah", frekuensi: "bulanan" }]);

    expect(await setup.audit.entriesAbout({ kind: "paket_layanan", id: created.paket.id })).toMatchObject([
      {
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "paket_layanan.buat",
        after: { name: "Paket Ziarah", frekuensi: "bulanan", item: ["Reguler", "Reguler"] },
        reason: "Paket v1",
      },
    ]);
  });

  it("is refused for a duplicate name, an empty item list, a repeated item, an unknown item or a frequency outside the four", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { varian } = await newLayananFor(setup, admin);
    const paket = { name: "Paket Ziarah", description: "", frekuensi: "tahunan" as const, itemIds: [varian.id], reason: null };
    expect(await setup.layanan.buatPaket(admin, paket)).toMatchObject({ ok: true });
    expect(await setup.layanan.buatPaket(admin, { ...paket, name: " paket   ziarah " })).toEqual({ ok: false, reason: "nama_sudah_ada" });

    for (const invalid of [
      { ...paket, name: "Paket Kosong", itemIds: [] },
      { ...paket, name: "Paket Kembar", itemIds: [varian.id, varian.id] },
      { ...paket, name: "Paket Hantu", itemIds: ["00000000-0000-4000-8000-000000000000"] },
      { ...paket, name: "Paket Mingguan", frekuensi: "mingguan" },
    ]) {
      expect(await setup.layanan.buatPaket(admin, invalid as unknown as NewPaket)).toEqual({ ok: false, reason: "paket_tidak_valid" });
    }
    expect(await setup.layanan.paket()).toHaveLength(1);
  });

  it("can be changed and removed by Admin Platform only, both audited", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, adminLokasi } = await publishedLokasiMitra(setup, admin);
    const { varian } = await newLayananFor(setup, admin);
    const created = await setup.layanan.buatPaket(admin, {
      name: "Paket Ziarah",
      description: "",
      frekuensi: "sekali",
      itemIds: [varian.id],
      reason: null,
    });
    if (!created.ok) throw new Error(`Paket refused: ${created.reason}`);

    expect(
      await setup.layanan.ubahPaket(adminLokasi, created.paket.id, { name: "Paket Baru", description: "", frekuensi: "tahunan", itemIds: [varian.id], reason: null }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.layanan.ubahPaket(admin, created.paket.id, {
        name: "Paket Ziarah Tahunan",
        description: "Sekali setahun.",
        frekuensi: "tahunan",
        itemIds: [varian.id],
        reason: "Frekuensi diubah",
      }),
    ).toMatchObject({ ok: true, paket: { name: "Paket Ziarah Tahunan", frekuensi: "tahunan" } });

    expect(await setup.layanan.hapusPaket(adminLokasi, created.paket.id, { reason: null })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.layanan.hapusPaket(admin, created.paket.id, { reason: "Tidak dipakai" })).toEqual({ ok: true });
    expect(await setup.layanan.paket()).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "paket_layanan", id: created.paket.id })).toMatchObject([
      { action: "paket_layanan.buat" },
      { action: "paket_layanan.ubah", before: { frekuensi: "sekali" }, after: { name: "Paket Ziarah Tahunan", frekuensi: "tahunan" }, reason: "Frekuensi diubah" },
      { action: "paket_layanan.hapus", before: { name: "Paket Ziarah Tahunan" }, after: null, reason: "Tidak dipakai" },
    ]);
    expect(lokasiMitra.id).not.toBe("");
  });
});

describe("the price of a Paket Layanan", () => {
  it("is the sum of its items' prices at that place, from the same all-in quote", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const { paket, varian } = await paketFixture(setup, admin);

    // Both items are offered at the Lokasi Mitra, each at that place's price.
    for (const satu of [varian.pembersihan, varian.laporan]) {
      await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, satu.id, { reason: null });
    }
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.pembersihan.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.laporan.id, { amount: 300_000, effectiveOn: "2026-10-01", reason: null });

    // 500.000 + 300.000 + one Biaya Layanan Platform of 150.000 for the cycle's Tagihan.
    const harga = await setup.layanan.hargaPaket(paket.id, { kind: "lokasi_mitra", lokasiId: lokasiMitra.id }, now());
    expect(harga).toMatchObject({
      total: 950_000,
      lines: [
        { kind: "layanan_lokasi", layananVariantId: varian.pembersihan.id, amount: 500_000 },
        { kind: "layanan_lokasi", layananVariantId: varian.laporan.id, amount: 300_000 },
        { kind: "biaya_layanan_platform", amount: 150_000 },
      ],
    });
  });

  it("is offered nowhere one of its items is not: the Paket disappears from that place", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    // A second listed Lokasi Mitra, which offers and prices only the first item.
    const kedua = await newLokasiMitra(setup, admin, "Makam Swasta Al-Barkah");
    await setLokasiMitraStatusForTest(db, kedua.id, "terverifikasi");
    const { paket, varian } = await paketFixture(setup, admin);

    for (const satu of [varian.pembersihan, varian.laporan]) {
      await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, satu.id, { reason: null });
      await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, satu.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    }
    await setup.layanan.tawarkanLayanan(admin, kedua.id, varian.pembersihan.id, { reason: null });
    await setup.tariffs.setHargaLayananLokasi(admin, kedua.id, varian.pembersihan.id, { amount: 450_000, effectiveOn: "2026-10-01", reason: null });

    // Two items at Rp 500.000 each plus the one Biaya Layanan Platform of the cycle.
    expect(await setup.layanan.hargaPaket(paket.id, { kind: "lokasi_mitra", lokasiId: lokasiMitra.id }, now())).toMatchObject({ total: 1_150_000 });
    expect(await setup.layanan.hargaPaket(paket.id, { kind: "lokasi_mitra", lokasiId: kedua.id }, now())).toBeNull();
    // Nor where an item is offered but has no price: a free item is no item.
    await setup.layanan.tawarkanLayanan(admin, kedua.id, varian.laporan.id, { reason: null });
    expect(await setup.layanan.hargaPaket(paket.id, { kind: "lokasi_mitra", lokasiId: kedua.id }, now())).toBeNull();
  });

  it("at a DKI TPU is the sum of the items' DKI prices, with no Biaya Layanan Platform, and only of the marked ones", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { paket, varian } = await paketFixture(setup, admin);
    // One item marked for TPU DKI, the other not: the Paket is not offered there.
    await setup.layanan.tandaiBolehDiTpu(admin, varian.pembersihan.id, { boleh: true, reason: null });
    for (const satu of [varian.pembersihan, varian.laporan]) {
      await setup.tariffs.setHargaLayananDki(admin, satu.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    }
    expect(await setup.layanan.hargaPaket(paket.id, { kind: "tpu_dki" }, now())).toBeNull();

    await setup.layanan.tandaiBolehDiTpu(admin, varian.laporan.id, { boleh: true, reason: null });
    expect(await setup.layanan.hargaPaket(paket.id, { kind: "tpu_dki" }, now())).toMatchObject({
      total: 1_000_000,
      lines: [
        { kind: "layanan_dki", amount: 500_000 },
        { kind: "layanan_dki", amount: 500_000 },
      ],
    });
  });

  it("is nothing for a Paket that does not exist", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);

    expect(await setup.layanan.hargaPaket("00000000-0000-4000-8000-000000000000", { kind: "lokasi_mitra", lokasiId: lokasiMitra.id }, now())).toBeNull();
  });
});

/** A Paket of Pembersihan Makam and Laporan Foto/Video, with both items' variant ids. */
async function paketFixture(setup: LayananSetup, admin: Actor) {
  const pembersihan = await newLayananFor(setup, admin, { name: "Pembersihan Makam" });
  const laporan = await newLayananFor(setup, admin, { name: "Laporan Foto/Video", bukti: "foto_dan_video", leadTimeDays: 1 });
  const dibuat = await setup.layanan.buatPaket(admin, {
    name: "Paket Perawatan",
    description: "Membersihkan dan melaporkan kondisi makam.",
    frekuensi: "bulanan",
    itemIds: [pembersihan.varian.id, laporan.varian.id],
    reason: null,
  });
  if (!dibuat.ok) throw new Error(`Paket refused: ${dibuat.reason}`);
  return { paket: dibuat.paket, varian: { pembersihan: pembersihan.varian, laporan: laporan.varian } };
}
