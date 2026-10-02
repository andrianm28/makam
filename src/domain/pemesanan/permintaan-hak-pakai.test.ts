/**
 * Pengembalian Hak Pakai, Ganti Pemegang Hak and the Calon Penghuni label (spec, Pemesanan > Requests
 * from the Pemegang Hak and Inventory > Operasi; stories 103, 104, 105, 125, 126; ticket 39), driven
 * only through the public interfaces of Pemesanan, Inventory, Lokasi and the Antrean, on the real
 * Postgres with the fake Clock.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PEMEGANG = "ibu.sari@contoh.id";

/**
 * A Lokasi Mitra with one occupied Petak (a Hak Pakai whose current Pemegang Hak's email is
 * `PEMEGANG`), with its own Ganti Pemegang Hak rules.
 */
async function fixture(setup: PemesananSetup, opsi: { saleTransfers?: boolean; fee?: number } = {}) {
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup);
  const lokasi = await terencanaLokasi(setup, admin, {});
  const kebijakan = await setup.lokasi.setPoliciesAndFlags(admin, lokasi.lokasiMitra.id, {
    policies: { ...DEFAULT_POLICIES, gantiPemegangHakFee: opsi.fee ?? 0 },
    flags: { ...DEFAULT_FLAGS, saleTransfersAllowed: opsi.saleTransfers ?? false, pemesananTerencanaAktif: true },
  });
  if (!kebijakan.ok) throw new Error(`setPoliciesAndFlags refused: ${kebijakan.reason}`);
  const sel = lokasi.sel.get("A-01");
  if (!sel) throw new Error("A-01 missing");
  const diisi = await setup.inventory.clearPetak(lokasi.adminLokasi, lokasi.lokasiMitra.id, sel.id, {
    mode: "terisi",
    dataMenyusul: false,
    pemegangHak: { name: "Ibu Sari", phoneNumber: "081311112222", email: PEMEGANG },
  });
  if (!diisi.ok || !diisi.hakPakaiId) throw new Error(`clearPetak refused: ${JSON.stringify(diisi)}`);
  return { admin, lokasi, hakPakaiId: diisi.hakPakaiId, pemegang: { accountId: "akun-ibu-sari", email: PEMEGANG } };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** The Antrean Lokasi rows this ticket owns. */
async function baris(setup: PemesananSetup, f: Fixture) {
  const antrean = await setup.queues.antreanLokasi(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id);
  return [...antrean.mendesak, ...antrean.lainnya].filter((row) => row.type === "permintaan_hak_pakai");
}

async function statusPetak(setup: PemesananSetup, f: Fixture, nomor: string) {
  const denah = await setup.inventory.asStaff(f.lokasi.adminLokasi).blok(f.lokasi.lokasiMitra.id, f.lokasi.blok.id);
  return denah?.cells.find((cell) => cell.nomorMakam === nomor)?.status;
}

describe("Pengembalian Hak Pakai", () => {
  it("is filed for an unused plot, has a row due while Diajukan, and on approval ends the Hak Pakai (reason Pengembalian) and frees the Petak", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);

    const diajukan = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(diajukan.permintaan).toMatchObject({ jenis: "pengembalian", status: "diajukan", unitNomor: "A-01" });

    const rows = await baris(setup, f);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Pengembalian Hak Pakai", subjectLabel: "A-01" });

    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });
    if (!setuju.ok) throw new Error(setuju.reason);

    const hakPakai = await setup.inventory.hakPakaiById(f.hakPakaiId);
    expect(hakPakai).toMatchObject({ status: "berakhir", endReason: "Pengembalian" });
    expect(await statusPetak(setup, f, "A-01")).toBe("tersedia");
    expect(await baris(setup, f)).toHaveLength(0);
  });

  it("is refused for a plot with a Pemakaman recorded under it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const dicatat = await setup.inventory.catatPemakaman(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id, {
      hakPakaiId: f.hakPakaiId,
      almarhumName: "Siti Aminah",
      tanggal: "2026-10-01",
    });
    if (!dicatat.ok) throw new Error(dicatat.reason);

    const hasil = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });

    expect(hasil).toEqual({ ok: false, reason: "sudah_ada_pemakaman" });
  });

  it("round-trips through Perlu Perbaikan (row gone, then back) and is Dibatalkan only before a decision", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const diajukan = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const perbaikan = await setup.pemesanan.mintaPerbaikanPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id, catatan: "Lampirkan surat" });
    if (!perbaikan.ok) throw new Error(perbaikan.reason);
    expect(perbaikan.permintaan.status).toBe("perlu_perbaikan");
    expect(await baris(setup, f)).toHaveLength(0);

    const ulang = await setup.pemesanan.ajukanUlangPermintaanHakPakai(f.pemegang, { id: diajukan.permintaan.id, catatan: "Sudah dilampirkan" });
    if (!ulang.ok) throw new Error(ulang.reason);
    expect(ulang.permintaan.status).toBe("diajukan");
    expect(await baris(setup, f)).toHaveLength(1);

    const batal = await setup.pemesanan.batalkanPermintaanHakPakai(f.pemegang, { id: diajukan.permintaan.id });
    if (!batal.ok) throw new Error(batal.reason);
    expect(batal.permintaan.status).toBe("dibatalkan");
    expect(await baris(setup, f)).toHaveLength(0);
  });

  it("cannot be withdrawn after the Admin Lokasi has decided", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const diajukan = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });
    if (!diajukan.ok) throw new Error(diajukan.reason);
    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });
    if (!setuju.ok) throw new Error(setuju.reason);

    const batal = await setup.pemesanan.batalkanPermintaanHakPakai(f.pemegang, { id: diajukan.permintaan.id });

    expect(batal).toEqual({ ok: false, reason: "status_tidak_sesuai" });
  });
});

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

describe("Perlu tindakan and documents", () => {
  it("lists a request sent back for a fix in the requester's Perlu tindakan until it is filed again", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const diajukan = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(await setup.pemesanan.permintaanHakPakaiPerluPerbaikan(f.pemegang)).toHaveLength(0);

    await setup.pemesanan.mintaPerbaikanPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id, catatan: "Lengkapi" });
    expect(await setup.pemesanan.permintaanHakPakaiPerluPerbaikan(f.pemegang)).toEqual([expect.objectContaining({ id: diajukan.permintaan.id, unitNomor: "A-01" })]);
    expect(await setup.pemesanan.permintaanHakPakaiPerluPerbaikan({ accountId: "akun-lain" })).toHaveLength(0);

    await setup.pemesanan.ajukanUlangPermintaanHakPakai(f.pemegang, { id: diajukan.permintaan.id });
    expect(await setup.pemesanan.permintaanHakPakaiPerluPerbaikan(f.pemegang)).toHaveLength(0);
  });

  it("keeps a Ganti request's attached documents in the private FileStore and shows them to that Lokasi's Admin Lokasi only", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const bukanPdf = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Bapak Hasan", phoneNumber: "081322223333" },
      sebab: "waris",
      berkas: [{ body: new Uint8Array([1, 2, 3]), contentType: "application/pdf" }],
    });
    expect(bukanPdf).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    const sebelum = setup.files.stored.size;
    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Bapak Hasan", phoneNumber: "081322223333" },
      sebab: "waris",
      berkas: [{ body: PDF, contentType: "application/pdf" }],
    });
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(setup.files.stored.size).toBe(sebelum + 1);

    const staf = await setup.pemesanan.permintaanHakPakaiUntukStaf(f.lokasi.adminLokasi, diajukan.permintaan.id);
    expect(staf?.dokumen).toHaveLength(1);
    expect(staf?.dokumen[0].url).toEqual(expect.any(String));
    expect(await setup.pemesanan.permintaanHakPakaiUntukStaf(f.admin, diajukan.permintaan.id)).toBeNull();
  });

  it("lets the Admin Lokasi change the holder's contact after a KTP check file is uploaded (a file that is not a KTP image or PDF is refused), and keeps that file", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const dasar = { hakPakaiId: f.hakPakaiId, phoneNumber: "081200001111", alasan: "KTP diperiksa" };
    const sebelum = setup.files.stored.size;

    const tanpa = await setup.inventory.ubahKontakPemegangHak(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id, dasar);
    expect(tanpa).toEqual({ ok: false, reason: "ktp_wajib" });

    const salah = await setup.inventory.ubahKontakPemegangHak(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id, { ...dasar, ktp: { body: new Uint8Array([9]), contentType: "image/png" } });
    expect(salah).toEqual({ ok: false, reason: "berkas_tidak_didukung" });

    const ok = await setup.inventory.ubahKontakPemegangHak(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id, {
      ...dasar,
      ktp: { body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), contentType: "image/png" },
    });
    expect(ok).toEqual({ ok: true });
    expect(setup.files.stored.size).toBe(sebelum + 1);
  });
});

describe("Ganti Pemegang Hak", () => {
  it("allows inheritance, keeps the earlier holder in the history, and moves the Hak Pakai to the new holder's Makam tab", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);

    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Anak Sari", phoneNumber: "081399998888", email: "anak.sari@contoh.id" },
      sebab: "waris",
      dokumen: [],
    });
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });
    if (!setuju.ok) throw new Error(setuju.reason);

    const riwayat = await setup.inventory.riwayatPemegangHak(f.hakPakaiId);
    expect(riwayat).toHaveLength(2);
    expect(riwayat.map((satu) => satu.name)).toEqual(["Ibu Sari", "Anak Sari"]);
    expect(riwayat[0]!.endAt).not.toBeNull();
    expect(riwayat[1]!.endAt).toBeNull();

    const makam = await setup.inventory.makamKeluargaSaya({ email: "anak.sari@contoh.id" });
    expect(makam.map((satu) => satu.hakPakaiId)).toContain(f.hakPakaiId);
  });

  it("carries the documents the family filed into the transfer record on approval", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const dokumen = ["ktp-ibu-sari.pdf", "surat-waris.pdf"];

    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Anak Sari", phoneNumber: "081399998888", email: "anak.sari@contoh.id" },
      sebab: "waris",
      dokumen,
    });
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });
    if (!setuju.ok) throw new Error(setuju.reason);

    const riwayat = await setup.inventory.riwayatPemegangHak(f.hakPakaiId);
    expect(riwayat.at(-1)?.dokumen).toEqual(dokumen);
  });

  it("refuses at approval a sale the Lokasi has forbidden since the request was filed", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup, { saleTransfers: true, fee: 500_000 });
    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Pembeli", phoneNumber: "081377776666" },
      sebab: "jual",
    });
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const larang = await setup.lokasi.setPoliciesAndFlags(f.admin, f.lokasi.lokasiMitra.id, {
      policies: { ...DEFAULT_POLICIES, gantiPemegangHakFee: 500_000 },
      flags: { ...DEFAULT_FLAGS, saleTransfersAllowed: false, pemesananTerencanaAktif: true },
    });
    if (!larang.ok) throw new Error(`setPoliciesAndFlags refused: ${larang.reason}`);

    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });

    expect(setuju).toEqual({ ok: false, reason: "jual_tidak_diizinkan" });
    const riwayat = await setup.inventory.riwayatPemegangHak(f.hakPakaiId);
    expect(riwayat.map((satu) => satu.name)).toEqual(["Ibu Sari"]);
  });

  it("refuses a sale where the Lokasi forbids sale transfers, and allows it where it does", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup, { saleTransfers: false, fee: 500_000 });

    const ditolak = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Pembeli", phoneNumber: "081377776666" },
      sebab: "jual",
    });
    expect(ditolak).toEqual({ ok: false, reason: "jual_tidak_diizinkan" });

    // The Lokasi switches sale transfers on; the same family may then file the same request.
    const izin = await setup.lokasi.setPoliciesAndFlags(f.admin, f.lokasi.lokasiMitra.id, {
      policies: { ...DEFAULT_POLICIES, gantiPemegangHakFee: 500_000 },
      flags: { ...DEFAULT_FLAGS, saleTransfersAllowed: true, pemesananTerencanaAktif: true },
    });
    if (!izin.ok) throw new Error(`setPoliciesAndFlags refused: ${izin.reason}`);
    const diterima = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Pembeli", phoneNumber: "081377776666" },
      sebab: "jual",
    });
    expect(diterima.ok).toBe(true);
  });

  it("is blocked while another request of the same Hak Pakai is open", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);
    const pengembalian = await setup.pemesanan.ajukanPengembalian(f.pemegang, { hakPakaiId: f.hakPakaiId });
    if (!pengembalian.ok) throw new Error(pengembalian.reason);

    const ganti = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Anak Sari", phoneNumber: "081399998888" },
      sebab: "waris",
    });

    expect(ganti).toEqual({ ok: false, reason: "sudah_ada_permintaan" });
  });

  it("notes the Lokasi's offline fee when it approves a sale", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup, { saleTransfers: true, fee: 500_000 });
    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(f.pemegang, {
      hakPakaiId: f.hakPakaiId,
      pemegangBaru: { name: "Pembeli", phoneNumber: "081377776666" },
      sebab: "jual",
    });
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const setuju = await setup.pemesanan.setujuiPermintaanHakPakai(f.lokasi.adminLokasi, { id: diajukan.permintaan.id });
    if (!setuju.ok) throw new Error(setuju.reason);
    const terakhir = await setup.pemesanan.permintaanHakPakaiTerakhir(f.hakPakaiId);

    expect(terakhir).toMatchObject({ status: "disetujui", biayaGantiOffline: 500_000 });
  });
});

describe("Calon Penghuni and the holder's contact", () => {
  it("changes the label immediately, notifies the Admin Lokasi, and opens no Antrean row", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);

    const hasil = await setup.pemesanan.ubahCalonPenghuni(f.pemegang, { hakPakaiId: f.hakPakaiId, label: "Ayah" });

    expect(hasil).toEqual({ ok: true, calonPenghuni: "Ayah" });
    expect((await setup.inventory.hakPakaiById(f.hakPakaiId))?.calonPenghuni).toBe("Ayah");
    expect(setup.calonPenghuni).toHaveLength(1);
    expect(await baris(setup, f)).toHaveLength(0);
  });

  it("lets the Admin Lokasi change the holder's number after a KTP check, keeping the name", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await fixture(setup);

    const hasil = await setup.inventory.ubahKontakPemegangHak(f.lokasi.adminLokasi, f.lokasi.lokasiMitra.id, {
      hakPakaiId: f.hakPakaiId,
      phoneNumber: "081200001111",
      email: "ibu.baru@contoh.id",
      alasan: "KTP diperiksa",
    });

    expect(hasil).toEqual({ ok: true });
    const hakPakai = await setup.inventory.hakPakaiById(f.hakPakaiId);
    expect(hakPakai?.pemegangHak).toMatchObject({ name: "Ibu Sari", phoneNumber: "+6281200001111", email: "ibu.baru@contoh.id" });
  });
});
