import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CARI_MAKAM_MAKS_PER_IP } from "@/domain/inventory";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { cellsOf, newBlok } from "../../../../tests/support/inventory";
import { publishOnTestDatabase, publishedLokasiMitra, signedInAdminPlatform } from "../../../../tests/support/publish";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { tampilanHub } from "./hub";

vi.mock("server-only", () => ({}));

const { db, close } = testDatabase();
afterAll(close);
// The page reads through the `web` runtime, so it is built on this run's database.
testServerRuntime();
const publish = publishOnTestDatabase(db);
beforeEach(resetDatabase);

/** The IP a lookup came from; the per-IP limit counts it. */
const IP = "203.0.113.10";

/**
 * A Terverifikasi Lokasi Mitra (so the hub's picker lists it) with a Blok whose
 * first Petak Makam is a grave — a Kavling Keluarga when `kavling` is asked for.
 */
async function lokasiDenganMakam(input: { almarhum?: string; tanggal?: string; email?: string; kavling?: boolean } = {}) {
  const { actor: admin } = await signedInAdminPlatform(publish);
  const { lokasiMitra, adminLokasi, jenisMakam } = await publishedLokasiMitra(publish, admin, "Makam Keluarga Sawah");
  const blok = await newBlok(publish, { admin, adminLokasi, lokasiMitra, jenisMakam }, { rows: 1, cols: input.kavling ? 2 : 1 });
  const cells = await cellsOf(publish, adminLokasi, lokasiMitra.id, blok.id);
  const pemakaman = { almarhumName: input.almarhum ?? "Hasan", date: input.tanggal ?? "2022-03-01" };
  const pemegangHak = { name: "Keluarga Hasan", phoneNumber: "081234567891", email: input.email };
  let kavlingId: string | null = null;
  let nomorKavling: string | null = null;
  if (input.kavling) {
    const dibuat = await publish.inventory.createKavling(adminLokasi, lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: jenisMakam.id,
    });
    if (!dibuat.ok) throw new Error(`Kavling refused: ${dibuat.reason}`);
    kavlingId = dibuat.kavlingId;
    const diisi = await publish.inventory.clearKavling(adminLokasi, lokasiMitra.id, kavlingId, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak,
      pemakaman: { ...pemakaman, petakId: cells[0].id },
    });
    if (!diisi.ok) throw new Error(`Kavling refused: ${diisi.reason}`);
    nomorKavling = (await publish.inventory.asStaff(adminLokasi).blok(lokasiMitra.id, blok.id))?.kavling[0]?.nomorKavling ?? null;
  } else {
    const diisi = await publish.inventory.clearPetak(adminLokasi, lokasiMitra.id, cells[0].id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak,
      pemakaman,
    });
    if (!diisi.ok) throw new Error(`Petak refused: ${diisi.reason}`);
  }
  return { lokasiMitra, cells, kavlingId, nomorKavling };
}

describe("the Makam keluarga hub page, read the way it reads for a family", () => {
  it("offers every Terverifikasi Lokasi Mitra to look in, by name", async () => {
    const { lokasiMitra } = await lokasiDenganMakam();

    const hub = await tampilanHub({}, { ip: IP });

    expect(hub.pilihanLokasi).toEqual([{ id: lokasiMitra.id, name: "Makam Keluarga Sawah", city: "Kota Jakarta Timur" }]);
    expect(hub.status).toBe("belum");
  });

  it("finds a grave by its Nomor Makam and says where it is, with the Hak Pakai and its end date", async () => {
    const { lokasiMitra, cells } = await lokasiDenganMakam({ almarhum: "Hasan", tanggal: "2022-03-01" });

    const hub = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_makam", nomor: cells[0].nomorMakam }, { ip: IP });

    expect(hub.status).toBe("ditemukan");
    expect(hub.ditemukan).toEqual([
      {
        lokasiId: lokasiMitra.id,
        namaLokasi: "Makam Keluarga Sawah",
        kavlingId: null,
        nomorKavling: null,
        petak: [
          {
            petakId: cells[0].id,
            nomorMakam: cells[0].nomorMakam,
            almarhum: ["Hasan"],
            status: { key: "aktif", label: "Aktif", arti: "Hak Pakai masih berlaku di Lokasi Mitra ini." },
            tanggalBerakhir: "2027-03-01",
          },
        ],
      },
    ]);
  });

  it("finds a grave by its Nomor Kavling, and answers with the whole Kavling", async () => {
    const { lokasiMitra, cells, nomorKavling } = await lokasiDenganMakam({ kavling: true });

    const hub = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_kavling", nomor: nomorKavling }, { ip: IP });

    expect(hub.status).toBe("ditemukan");
    expect(hub.ditemukan[0]?.petak.map((satu) => satu.nomorMakam)).toEqual([cells[0].nomorMakam, cells[1].nomorMakam]);
  });

  it("finds a grave by the Almarhum's name and the year they died", async () => {
    const { lokasiMitra } = await lokasiDenganMakam({ almarhum: "Hasan", tanggal: "2022-03-01" });

    const hub = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nama", nama: "hasan", tahun: "2022" }, { ip: IP });

    expect(hub.status).toBe("ditemukan");
    expect(hub.ditemukan[0]?.petak[0]?.almarhum).toEqual(["Hasan"]);
  });

  it("says the same thing for a number that was never used and for a name that is not in that year", async () => {
    const { lokasiMitra } = await lokasiDenganMakam();

    const nomorTypo = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_makam", nomor: "Z-999" }, { ip: IP });
    const namaTypo = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nama", nama: "Hasan", tahun: "1999" }, { ip: IP });

    // One wording for every miss, so the answer never says which of them was close.
    expect(nomorTypo.pesan).toBe(namaTypo.pesan);
    expect(nomorTypo.ditemukan).toEqual([]);
    expect(namaTypo.ditemukan).toEqual([]);
  });

  it("asks for what is still missing instead of answering an empty form as a miss", async () => {
    const belumLengkap = await tampilanHub({ cari: "nomor_makam" }, { ip: IP });

    expect(belumLengkap.status).toBe("perlu_lengkap");
    expect(belumLengkap.pesan).not.toBeNull();
  });

  it("refuses the lookup past the per-IP limit and says when to try again, naming no place either way", async () => {
    const { lokasiMitra, cells } = await lokasiDenganMakam();
    for (let i = 0; i < CARI_MAKAM_MAKS_PER_IP; i += 1) {
      await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_makam", nomor: `A-${i}` }, { ip: IP });
    }

    const refused = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_makam", nomor: cells[0].nomorMakam }, { ip: IP });

    expect(refused.status).toBe("terlalu_sering");
    expect(refused.ditemukan).toEqual([]);
    expect(refused.pesan).toContain("Terlalu banyak");
    expect(refused.retryAt).toBeInstanceOf(Date);
  });

  it("carries no trace of the Pemegang Hak anywhere in what the page reads", async () => {
    const { lokasiMitra, cells } = await lokasiDenganMakam({ email: "waris@contoh.id" });

    const hub = await tampilanHub({ lokasi: lokasiMitra.id, cari: "nomor_makam", nomor: cells[0].nomorMakam }, { ip: IP });

    // The page reads the lookup and nothing else: an heir learns where the grave is, never who holds it.
    const json = JSON.stringify(hub);
    for (const nilai of ["Keluarga Hasan", "waris@contoh.id", "081234567891", "6281234567891"]) {
      expect(json, `the Pemegang Hak's ${nilai} reached the page`).not.toContain(nilai);
    }
  });
});

describe("the branch the hub was opened with", () => {
  it("keeps the action the Beranda's tile preselected, with the other branches beside it", async () => {
    const hub = await tampilanHub({ aksi: "perpanjang" }, { ip: IP });

    expect(hub.aksiTerpilih).toBe("perpanjang");
    // The branch the tile preselected is the card the family lands on; the others keep their own order.
    expect(hub.kartuAksi.map((kartu) => kartu.aksi)).toEqual(["perpanjang", "tumpang", "layanan", "pengurusan"]);
  });

  it("is no branch at all for an action the hub does not own, rather than an error", async () => {
    expect((await tampilanHub({ aksi: "hapus" }, { ip: IP })).aksiTerpilih).toBeNull();
  });
});

describe("the Makam tab of a signed-in Akun", () => {
  it("lists that email's own graves as shortcuts into the hub, with the preselected action kept", async () => {
    const { lokasiMitra, cells } = await lokasiDenganMakam({ email: "waris@contoh.id" });

    const hub = await tampilanHub({ aksi: "layanan" }, { ip: IP, email: "WARIS@CONTOH.ID" });

    expect(hub.tabSaya).toEqual([
      {
        lokasiId: lokasiMitra.id,
        namaLokasi: "Makam Keluarga Sawah",
        nomor: cells[0].nomorMakam,
        almarhum: ["Hasan"],
        alamat: `/makam-keluarga?aksi=layanan&lokasi=${lokasiMitra.id}&cari=nomor_makam&nomor=${encodeURIComponent(cells[0].nomorMakam!)}`,
      },
    ]);
  });

  it("is empty for a visitor with no session, and for an email that holds nothing", async () => {
    await lokasiDenganMakam({ email: "waris@contoh.id" });

    const anonim = await tampilanHub({}, { ip: IP });
    const emailLain = await tampilanHub({}, { ip: IP, email: "orang.lain@contoh.id" });

    // The graves are on record; nobody but the holder's own Akun is told where.
    expect(anonim.tabSaya).toEqual([]);
    expect(emailLain.tabSaya).toEqual([]);
  });
});
