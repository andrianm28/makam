/**
 * Perpanjangan TPU, the IPTM renewal of a Makam TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48),
 * read only through the Pengurusan module's public functions and what its neighbours show from outside.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pengajuanOnTestDatabase, type PengajuanSetup } from "../../../tests/support/pengurusan";
import { makamTpuDenganIptm } from "../../../tests/support/makam-tpu";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Makam TPU whose IPTM expires on `berlakuSampai`. */
async function makamBerakhir(setup: PengajuanSetup, berlakuSampai: string) {
  return makamTpuDenganIptm(setup, berlakuSampai);
}

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;
type Dasar = Awaited<ReturnType<typeof makamBerakhir>>;

/** An order placed on 20 December 2026, inside the 3 months before the IPTM's expiry on 15 February 2027. */
async function pesanan(setup: PengajuanSetup, dasar: Dasar, berlakuSampai = "2027-02-15") {
  const hasil = await ajukan(setup, dasar, berlakuSampai);
  if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
  return hasil.pengurusan.nomor;
}

async function unggah(setup: PengajuanSetup, dasar: Dasar, nomor: string, nama?: string) {
  const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    if (nama && dokumen.nama !== nama) continue;
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
}

const ajukan = (setup: PengajuanSetup, dasar: Awaited<ReturnType<typeof makamBerakhir>>, berlakuSampai: string) =>
  setup.pengurusan.placePerpanjanganTpu({
    pemesan: dasar.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    makamTpuId: dasar.makamTpuId,
    berlakuSampai,
  });

describe("requesting a Perpanjangan TPU", () => {
  it("is refused more than 3 months before the IPTM expires and allowed from exactly 3 months before", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");

    setup.clock.set(wib("2026-11-14 10:00"));
    expect(await ajukan(setup, dasar, "2027-02-15")).toEqual({ ok: false, reason: "terlalu_awal" });

    setup.clock.set(wib("2026-11-15 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-02-15");
    expect(hasil).toMatchObject({ ok: true, pengurusan: { status: "diajukan", lewatMasaTenggang: false } });
  });
});

describe("the document check and the pay-first Tagihan", () => {
  it("issues no Tagihan before the check and, once the documents pass, a pay-first Tagihan for the filing-only Biaya Pengurusan due 3×24 h later", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ kind: "perpanjangan_tpu", status: "diajukan", tagihan: null });

    const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
    await unggah(setup, dasar, nomor, order!.dokumen.pengajuan[0]!.nama);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });

    setup.clock.set(wib("2026-12-20 14:00"));
    await unggah(setup, dasar, nomor);
    const hasil = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor });
    if (!hasil.ok || hasil.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(hasil)}`);
    expect(hasil.tagihan.dueAt).toEqual(wib("2026-12-23 14:00"));
    const tagihan = await setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan!.total).toBe(1_000_000);
    expect(tagihan!.lines.map((baris) => baris.kind)).not.toContain("biaya_layanan_platform");
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "menunggu_pembayaran" });
  });
});
