import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const isian = (ubah: Record<string, string> = {}) => ({
  nama: "BAQI Memorial Park Bogor Timur",
  kota: "Kabupaten Bogor",
  alamat: "Kp. Bunder, Desa Buanajaya, Kec. Tanjungsari",
  pengelola: "BAQI Memorial Park",
  segmen: "Khusus Muslim",
  luas: "",
  fasilitas: "Musala, aula, layanan 24 jam.",
  sumber: "baqimemorialpark.id\n\n  RRI, Desember 2024  ",
  urutan: "80",
  ...ubah,
});

describe("Info Makam Swasta: private cemeteries that are not Lokasi Mitra, kept by Admin Platform", () => {
  it("Admin Platform adds an entry: the public read shows it with its sources and a slug from its name, and the write is audited", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    expect(await setup.lokasi.infoMakamSwastaTayang()).toEqual([]);

    const ditambah = await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian());
    expect(ditambah).toMatchObject({ ok: true });

    expect(await setup.lokasi.infoMakamSwastaTayang()).toEqual([
      expect.objectContaining({
        slug: "baqi-memorial-park-bogor-timur",
        nama: "BAQI Memorial Park Bogor Timur",
        kota: "Kabupaten Bogor",
        luas: null,
        sumber: ["baqimemorialpark.id", "RRI, Desember 2024"],
        urutan: 80,
        tampil: true,
      }),
    ]);
    const id = (ditambah as { id: string }).id;
    const entri = await setup.audit.entriesAbout({ kind: "info_makam_swasta", id });
    expect(entri).toEqual([expect.objectContaining({ action: "lokasi.ubah_info_makam_swasta", before: null })]);
  });

  it("Admin Platform corrects an entry and its slug stays; the public pages list entries in Admin Platform's order", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const baqi = (await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ kota: "Kota Bogor" }))) as { id: string };
    await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ nama: "Heaven Memorial Park", urutan: "10" }));

    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, baqi.id, isian({ kota: "Kabupaten Bogor", nama: "BAQI Memorial Park" }))).toEqual({ ok: true, id: baqi.id });

    const tayang = await setup.lokasi.infoMakamSwastaTayang();
    expect(tayang.map((satu) => satu.nama)).toEqual(["Heaven Memorial Park", "BAQI Memorial Park"]);
    expect(tayang[1]).toMatchObject({ slug: "baqi-memorial-park-bogor-timur", kota: "Kabupaten Bogor" });
  });

  it("a hidden entry leaves the public pages but stays on Admin Platform's list, and shows again when Admin Platform says so", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { id } = (await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian())) as { id: string };

    expect(await setup.lokasi.aturTampilInfoMakamSwasta(admin, id, false)).toEqual({ ok: true });
    expect(await setup.lokasi.infoMakamSwastaTayang()).toEqual([]);
    expect(await setup.lokasi.semuaInfoMakamSwasta(admin)).toEqual([expect.objectContaining({ id, tampil: false })]);

    await setup.lokasi.aturTampilInfoMakamSwasta(admin, id, true);
    expect(await setup.lokasi.infoMakamSwastaTayang()).toEqual([expect.objectContaining({ id })]);
  });

  it("refuses an entry that claims a partnership, a verification or a price, one with no source, and a second entry of the same name", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ fasilitas: "Mulai Rp 5.000.000" }))).toEqual({ ok: false, reason: "klaim_terlarang" });
    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ segmen: "Sudah terverifikasi" }))).toEqual({ ok: false, reason: "klaim_terlarang" });
    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ pengelola: "Sudah bermitra" }))).toEqual({ ok: false, reason: "klaim_terlarang" });
    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian({ sumber: "  \n " }))).toEqual({ ok: false, reason: "isian_tidak_valid" });
    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian())).toMatchObject({ ok: true });
    expect(await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian())).toEqual({ ok: false, reason: "nama_sudah_ada" });
    expect(await setup.lokasi.infoMakamSwastaTayang()).toHaveLength(1);
  });

  it("only Admin Platform keeps the list: an Admin Lokasi is refused and reads nothing", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);
    await setup.lokasi.simpanInfoMakamSwasta(admin, null, isian());

    expect(await setup.lokasi.simpanInfoMakamSwasta(adminLokasi, null, isian({ nama: "Lain" }))).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.semuaInfoMakamSwasta(adminLokasi)).toEqual([]);
  });
});
