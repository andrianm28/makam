/**
 * The monthly Laporan and the weekly list of outgoing transfers (spec, Work
 * Queues > Laporan; story 165; ticket 33), driven through the public interfaces
 * of Work Queues, Billing, Payouts and Refunds on the test Postgres.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  adminLokasiOf,
  bayarTagihan,
  buktiTransfer,
  catatPemakaman,
  konfirmasiPesanan,
  mitraJasa,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsSetup,
} from "../../../tests/support/payouts";
import { barisLaporan, laporanKeCsv, seninMinggu } from "./laporan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pemakaman = wib("2026-10-02 10:00");
const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };

type Fixture = Awaited<ReturnType<typeof pesananSaatDukaSiap>> & Awaited<ReturnType<typeof konfirmasiPesanan>>;

/** A Saat Duka order at its own Lokasi Mitra, confirmed and paid (Rp 9.650.000: Rp 9.500.000 of tariff and the Rp 150.000 Biaya Layanan Platform). */
async function pesananTerbayar(setup: PayoutsSetup, nama: string, email: string, metode: Parameters<typeof bayarTagihan>[2] = undefined): Promise<Fixture> {
  const fixture = await pesananSaatDukaSiap(setup, { name: nama, email });
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId, metode);
  return { ...fixture, ...konfirmasi };
}

/** The signed-in Pemesan of a fixture's order, as the guard would hand it to the module. */
function pemesanActor(pemesan: { accountId: string; email: string }): Actor {
  return { ...pemesan, phoneNumber: null, roles: ["pemesan"], lokasiIds: [], totp: "tidak_perlu", sessionId: "sesi-uji" };
}

/** Pays that order out to its Lokasi Mitra in two transfers, one item each, on the two dates given (the Clock moves to the later one first, so neither is in the future). */
async function cairkanDiDuaTanggal(setup: PayoutsSetup, fixture: Fixture, tanggalPertama: string, tanggalKedua: string) {
  setup.clock.set(wib(`${[tanggalPertama, tanggalKedua].sort()[1]} 12:00`));
  await catatPemakaman(setup, fixture.nomor, pemakaman);
  await setup.payouts.tick();
  const [row] = await setup.payouts.jalankanPencairan(fixture.admin);
  if (!row || row.items.length !== 2) throw new Error("expected two due items");
  const bukti = [];
  for (const [item, tanggal] of [
    [row.items[0]!, tanggalPertama],
    [row.items[1]!, tanggalKedua],
  ] as const) {
    const terbit = await setup.payouts.terbitkanBuktiPencairan(fixture.admin, { itemIds: [item.id], ditransferPada: tanggal, bukti: buktiTransfer });
    if (!terbit.ok) throw new Error(`Bukti Pencairan refused: ${terbit.reason}`);
    bukti.push(terbit.bukti);
  }
  return bukti;
}

/** The Pemesan cancels a paid order before its burial, and Admin Platform approves and transfers the refund on `tanggal` (the Clock moves there after the cancellation). */
async function kembalikanDana(setup: PayoutsSetup, fixture: Fixture, tanggal: string) {
  const dibatalkan = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" });
  if (!dibatalkan.ok) throw new Error(`cancellation refused: ${dibatalkan.reason}`);
  setup.clock.set(wib(`${tanggal} 12:00`));
  await setup.refunds.tick();
  const [permintaan] = await setup.refunds.permintaanTerbuka();
  if (!permintaan) throw new Error("no refund request");
  await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "Rekening dari keluarga lewat telepon" });
  const setuju = await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
  if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);
  const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, { permintaanId: permintaan.id, ditransferPada: tanggal, bukti: buktiTransfer });
  if (!terbit.ok) throw new Error(`refund transfer refused: ${terbit.reason}`);
  return terbit.bukti;
}

async function laporan(setup: PayoutsSetup, fixture: Pick<Fixture, "admin">, bulan: string) {
  const hasil = await setup.queues.laporanBulanan(fixture.admin, bulan);
  if (!hasil.ok) throw new Error(`Laporan refused: ${hasil.reason}`);
  return hasil.laporan;
}

describe("the monthly Laporan", () => {
  it("counts a month's orders by kind, Rp collected by method, platform fees, Pencairan paid, refunds paid and Tidak Tertagih", async () => {
    const setup = payoutsOnTestDatabase(db);
    // Order A: paid through the provider, buried, and its whole Pencairan (Rp 9.500.000) transferred.
    const pesananA = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id");
    await cairkanDiDuaTanggal(setup, pesananA, "2026-10-01", "2026-10-01");
    // Order B: paid in cash, then cancelled by the family: Rp 9.500.000 refunded (the Biaya Layanan Platform is kept).
    const pesananB = await pesananTerbayar(setup, "Makam Sawah Besar", "pemesan.b@contoh.id", { kind: "tunai" });
    await kembalikanDana(setup, pesananB, "2026-10-01");
    // Order C: confirmed but never paid: an order, and no money.
    const pesananC = await pesananSaatDukaSiap(setup, { name: "Makam Kebun Jeruk", email: "pemesan.c@contoh.id" });
    await konfirmasiPesanan(setup, pesananC);

    const oktober = await laporan(setup, pesananA, "2026-10");

    expect(oktober).toMatchObject({ bulan: "2026-10", dari: "2026-10-01", sampai: "2026-11-01" });
    expect(oktober.pesanan.find((row) => row.kind === "saat_duka")?.jumlah).toBe(3);
    expect(oktober.pesanan.filter((row) => row.kind !== "saat_duka").every((row) => row.jumlah === 0)).toBe(true);
    expect(oktober.diterima.find((row) => row.metode === "penyedia_pembayaran")).toEqual({ metode: "penyedia_pembayaran", jumlahPembayaran: 1, amount: 9_650_000 });
    expect(oktober.diterima.find((row) => row.metode === "tunai")).toEqual({ metode: "tunai", jumlahPembayaran: 1, amount: 9_650_000 });
    expect(oktober.totalDiterimaOperator).toBe(19_300_000);
    expect(oktober.biaya).toEqual({ biayaLayananPlatform: 300_000, biayaPengurusan: 0 });
    expect(oktober.pencairan).toMatchObject({ jumlahBukti: 2, amount: 9_500_000, lokasiMitra: { jumlahBukti: 2, amount: 9_500_000 } });
    expect(oktober.pengembalian).toEqual({ jumlahBukti: 1, amount: 9_500_000 });
    expect(oktober.tidakTertagih).toEqual({ jumlah: 0, amount: 0 });
  });

  it("cuts the month at midnight WIB: a payment at 23:30 WIB on 30 September is September's, one at 00:30 WIB on 1 Oktober is Oktober's", async () => {
    const setup = payoutsOnTestDatabase(db);
    // Both orders are placed and confirmed on 1 Oktober (WIB); they are paid at the two ends of the month's boundary.
    const akhirOktober = await pesananSaatDukaSiap(setup, { name: "Makam Wakaf Al-Ikhlas", email: "pemesan.a@contoh.id" });
    const konfirmasiA = await konfirmasiPesanan(setup, akhirOktober);
    const awalNovember = await pesananSaatDukaSiap(setup, { name: "Makam Sawah Besar", email: "pemesan.b@contoh.id" });
    const konfirmasiB = await konfirmasiPesanan(setup, awalNovember);
    setup.clock.set(wib("2026-10-31 23:30"));
    await bayarTagihan(setup, konfirmasiA.tagihanId);
    setup.clock.set(wib("2026-11-01 00:30"));
    await bayarTagihan(setup, konfirmasiB.tagihanId);

    const oktober = await laporan(setup, akhirOktober, "2026-10");
    const november = await laporan(setup, akhirOktober, "2026-11");
    const desember = await laporan(setup, akhirOktober, "2026-12");

    // Orders count in the month they were placed (both 1 Oktober); the money counts in the month it came in.
    expect(oktober.pesanan.find((row) => row.kind === "saat_duka")?.jumlah).toBe(2);
    expect(oktober.totalDiterimaOperator).toBe(9_650_000);
    expect(oktober.biaya.biayaLayananPlatform).toBe(150_000);
    expect(november.pesanan.find((row) => row.kind === "saat_duka")?.jumlah).toBe(0);
    expect(november.totalDiterimaOperator).toBe(9_650_000);
    expect(november.biaya.biayaLayananPlatform).toBe(150_000);
    expect(desember.totalDiterimaOperator).toBe(0);
    // December rolls into the next year without a stray month.
    expect(desember).toMatchObject({ dari: "2026-12-01", sampai: "2027-01-01" });
  });

  it("does not count money a Lokasi Mitra took directly as Rp the Operator collected, but still lists it by method", async () => {
    const setup = payoutsOnTestDatabase(db);
    const pesanan = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id", { kind: "langsung_ke_lokasi", lokasiName: "Makam Wakaf Al-Ikhlas" });

    const oktober = await laporan(setup, pesanan, "2026-10");

    expect(oktober.diterima.find((row) => row.metode === "langsung_ke_lokasi")?.amount).toBe(9_650_000);
    expect(oktober.totalDiterimaOperator).toBe(0);
  });

  it("exports a CSV whose every row is a row of the Laporan on screen, with the same numbers", async () => {
    const setup = payoutsOnTestDatabase(db);
    const pesananA = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id");
    await cairkanDiDuaTanggal(setup, pesananA, "2026-10-01", "2026-10-01");
    const oktober = await laporan(setup, pesananA, "2026-10");

    const csv = laporanKeCsv(oktober);

    expect(csv.endsWith("\r\n")).toBe(true);
    const baris = csv.trimEnd().split("\r\n");
    expect(baris[0]).toContain("Laporan 2026-10");
    expect(baris[1]).toBe("Bagian,Keterangan,Jumlah,Rp");
    const disaring = (teks: string) => teks.replaceAll('"', "");
    expect(baris.slice(2).map(disaring)).toEqual(
      barisLaporan(oktober).map((row) => disaring([row.bagian, row.keterangan, row.jumlah ?? "", row.amount ?? ""].join(",")).replaceAll(",", ",")),
    );
    expect(baris).toContain("Pesanan,Pemesanan Saat Duka,1,");
    expect(baris).toContain("Pencairan dibayar,Lokasi Mitra,2,9500000");
    expect(baris).toContain("Pendapatan Operator,Biaya Layanan Platform,,150000");
    expect(baris).toContain("Pengembalian dana dibayar,Total pengembalian dana,0,0");
  });

  it("opens only for Admin Platform: an Admin Lokasi, a Mitra Jasa and a Pemesan are refused, and a bad month is invalid", async () => {
    const setup = payoutsOnTestDatabase(db);
    const pesanan = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id");
    const adminLokasi = await adminLokasiOf(setup, pesanan.admin, pesanan.lokasiMitra.id, 1);
    const jasa = await mitraJasa(setup, pesanan.admin);

    for (const actor of [adminLokasi, jasa.actor, pemesanActor(pesanan.pemesan)]) {
      expect(await setup.queues.laporanBulanan(actor, "2026-10")).toEqual({ ok: false, reason: "tidak_berwenang" });
      expect(await setup.queues.daftarTransferMingguan(actor, "2026-10-05")).toEqual({ ok: false, reason: "tidak_berwenang" });
    }
    expect(await setup.queues.laporanBulanan(pesanan.admin, "2026-13")).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.queues.laporanBulanan(pesanan.admin, "Oktober")).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.queues.daftarTransferMingguan(pesanan.admin, "2026-02-30")).toEqual({ ok: false, reason: "input_tidak_valid" });
  });
});

describe("the weekly list of outgoing transfers", () => {
  it("runs Monday to Sunday in WIB: the Sunday before and the Monday after are another week's", async () => {
    const setup = payoutsOnTestDatabase(db);
    // Two orders, four Bukti Pencairan: on Sunday 4, Monday 5, Sunday 11 and Monday 12 Oktober 2026.
    const pesananA = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id");
    const pesananB = await pesananTerbayar(setup, "Makam Sawah Besar", "pemesan.b@contoh.id");
    const [minggu4, senin5] = await cairkanDiDuaTanggal(setup, pesananA, "2026-10-04", "2026-10-05");
    const [minggu11, senin12] = await cairkanDiDuaTanggal(setup, pesananB, "2026-10-11", "2026-10-12");

    const daftar = async (tanggal: string) => {
      const hasil = await setup.queues.daftarTransferMingguan(pesananA.admin, tanggal);
      if (!hasil.ok) throw new Error(`list refused: ${hasil.reason}`);
      return hasil.daftar;
    };

    // Any day of the week names it: Wednesday 7 Oktober, the Monday itself and the Sunday itself.
    for (const tanggal of ["2026-10-05", "2026-10-07", "2026-10-11"]) {
      const minggu = await daftar(tanggal);
      expect(minggu).toMatchObject({ dari: "2026-10-05", sampai: "2026-10-12" });
      expect(minggu.transfer.map((row) => row.nomorBukti)).toEqual([senin5.nomorBukti, minggu11.nomorBukti]);
    }
    expect((await daftar("2026-10-04")).transfer.map((row) => row.nomorBukti)).toEqual([minggu4.nomorBukti]);
    expect((await daftar("2026-10-12")).transfer.map((row) => row.nomorBukti)).toEqual([senin12.nomorBukti]);
    expect((await daftar("2026-10-20")).transfer).toEqual([]);
    expect(seninMinggu("2026-10-11")).toBe("2026-10-05");
    expect(seninMinggu("2026-10-12")).toBe("2026-10-12");
  });

  it("shows each transfer's date, recipient, amount, Bukti number, approver and proof, Pencairan and refunds together", async () => {
    const setup = payoutsOnTestDatabase(db);
    const pesananA = await pesananTerbayar(setup, "Makam Wakaf Al-Ikhlas", "pemesan.a@contoh.id");
    const pesananB = await pesananTerbayar(setup, "Makam Sawah Besar", "pemesan.b@contoh.id");
    const [pencairan] = await cairkanDiDuaTanggal(setup, pesananA, "2026-10-06", "2026-10-07");
    const pengembalian = await kembalikanDana(setup, pesananB, "2026-10-07");

    const hasil = await setup.queues.daftarTransferMingguan(pesananA.admin, "2026-10-08");

    if (!hasil.ok) throw new Error(hasil.reason);
    const akun = (await setup.identity.staffAccounts()).find((satu) => satu.accountId === pesananA.admin.accountId);
    const penyetuju = akun?.name || akun?.email;
    expect(penyetuju).toBeTruthy();
    expect(hasil.daftar.transfer).toHaveLength(3);
    expect(hasil.daftar.transfer[0]).toMatchObject({
      jenis: "pencairan",
      tanggal: "2026-10-06",
      penerima: "Makam Wakaf Al-Ikhlas",
      amount: 7_500_000,
      nomorBukti: pencairan!.nomorBukti,
      disetujuiOleh: penyetuju,
      hrefBukti: `/dokumen/${pencairan!.link}`,
    });
    expect(hasil.daftar.transfer[0]?.buktiTransferUrl).toEqual(expect.stringContaining("pencairan/"));
    const refund = hasil.daftar.transfer.find((row) => row.jenis === "pengembalian");
    expect(refund).toMatchObject({
      tanggal: "2026-10-07",
      penerima: "Budi Santoso",
      amount: 9_500_000,
      nomorBukti: pengembalian.nomor,
      disetujuiOleh: penyetuju,
      hrefBukti: `/dokumen/${pengembalian.link}`,
    });
    expect(refund?.buktiTransferUrl).toEqual(expect.stringContaining("pengembalian/"));
    expect(hasil.daftar.total).toEqual({ pencairan: 9_500_000, pengembalian: 9_500_000, semua: 19_000_000 });
    // Oldest first: the Pencairan of the 6th, then the 7th's two transfers in number order.
    expect(hasil.daftar.transfer.map((row) => row.tanggal)).toEqual(["2026-10-06", "2026-10-07", "2026-10-07"]);
  });
});
