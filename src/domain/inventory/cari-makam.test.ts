import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { scheduledTicks } from "@/domain/scheduler";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok, type InventorySetup } from "../../../tests/support/inventory";
import { CARI_MAKAM_JENDELA_MENIT, CARI_MAKAM_MAKS_PER_IP, KUNCI_HASIL_CARI_MAKAM, pruneCariMakamAttempts } from "./cari-makam";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The IP a lookup came from; the rate limit counts per IP. */
const IP = "203.0.113.10";

/** A Lokasi Mitra with one Blok of Petak Makam, nothing cleared yet. */
async function denah(setup: InventorySetup, input: { name?: string; rows?: number; cols?: number } = {}) {
  const fixture = await denahFixture(setup);
  const blok = await newBlok(setup, fixture, { name: input.name ?? "A", rows: input.rows ?? 1, cols: input.cols ?? 1 });
  const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
  return { ...fixture, blok, cells };
}

/** One Petak Makam that is a grave: an Aktif Hak Pakai with its Pemegang Hak and one burial in it. */
async function satuMakam(
  setup: InventorySetup,
  input: { almarhum?: string; tanggal?: string; pemegangHak?: string; email?: string; dari?: Awaited<ReturnType<typeof denah>> } = {},
) {
  const { cells, ...fixture } = input.dari ?? (await denah(setup));
  const petak = cells[0];
  const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, petak.id, {
    mode: "terisi",
    dataMenyusul: false,
    pemegangHak: { name: input.pemegangHak ?? "Siti Aminah", phoneNumber: "081234567891", email: input.email },
    pemakaman: { almarhumName: input.almarhum ?? "Abdullah", date: input.tanggal ?? "2020-06-15" },
  });
  if (!diisi.ok) throw new Error(`Petak refused: ${diisi.reason}`);
  return { ...fixture, petak, nomorMakam: petak.nomorMakam! };
}

/** A Kavling Keluarga of two Petak in a Blok of its own, occupied, with one burial in its first Petak. */
async function satuKavling(setup: InventorySetup, input: { almarhum?: string; tanggal?: string } = {}) {
  const { cells, ...fixture } = await denah(setup, { name: "B", cols: 2 });
  const dibuat = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, fixture.blok.id, {
    cellIds: cells.map((cell) => cell.id),
    jenisMakamId: fixture.jenisMakam.id,
  });
  if (!dibuat.ok) throw new Error(`Kavling refused: ${dibuat.reason}`);
  const diisi = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, dibuat.kavlingId, {
    mode: "terisi",
    dataMenyusul: false,
    pemegangHak: { name: "Keluarga Hasan", phoneNumber: "081234567891" },
    pemakaman: { almarhumName: input.almarhum ?? "Hasan", date: input.tanggal ?? "2022-03-01", petakId: cells[0].id },
  });
  if (!diisi.ok) throw new Error(`Kavling refused: ${diisi.reason}`);
  const blok = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, fixture.blok.id);
  const nomorKavling = blok?.kavling[0]?.nomorKavling;
  if (!nomorKavling) throw new Error("the Kavling Keluarga has no number");
  return { ...fixture, cells, kavlingId: dibuat.kavlingId, nomorKavling };
}

/** Every object key in a payload, at every depth: what a family is given, not what the page happens to render. */
function kunciDiDalam(nilai: unknown): string[] {
  if (Array.isArray(nilai)) return nilai.flatMap(kunciDiDalam);
  if (nilai === null || typeof nilai !== "object") return [];
  return Object.entries(nilai).flatMap(([key, dalam]) => [key, ...kunciDiDalam(dalam)]);
}

describe("a family looking for where a grave is (spec, Inventory > lookup)", () => {
  it("finds a Petak Makam by its Nomor Makam at a Lokasi Mitra, with the Hak Pakai and its end date", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra, nomorMakam } = await satuMakam(setup);

    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: lokasiMitra.id, nomor: nomorMakam });

    expect(hasil).toEqual({
      ok: true,
      ditemukan: [
        {
          hakPakaiId: expect.any(String),
          lokasiId: lokasiMitra.id,
          kavlingId: null,
          nomorKavling: null,
          petak: [
            {
              petakId: expect.any(String),
              nomorMakam,
              almarhum: ["Abdullah"],
              statusHakPakai: "aktif",
              // The tenure clock started at the burial: 2020-06-15 + 5 tahun.
              tanggalBerakhir: "2025-06-15",
            },
          ],
        },
      ],
    });
  });

  it("finds the same Petak by a number it was renumbered from, and shows only the number it has now", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { admin, lokasiMitra, petak, nomorMakam: lama } = await satuMakam(setup);
    const baru = await setup.inventory.renumberPetak(admin, lokasiMitra.id, petak.id, "A-99");
    expect(baru).toEqual({ ok: true, nomorMakam: "A-99" });

    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: lokasiMitra.id, nomor: lama });

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) throw new Error("unreachable");
    expect(hasil.ditemukan[0]?.petak[0]?.nomorMakam).toBe("A-99");
    // The old number is nowhere in the payload: an alias is not an identity a family may quote.
    expect(JSON.stringify(hasil)).not.toContain(lama);
  });

  it("says nothing about the Pemegang Hak: the payload's own keys are the only ones a family is given", async () => {
    const setup = inventoryOnTestDatabase(db);
    const pemegangHak = "Zainal Abubakar";
    const { lokasiMitra, nomorMakam } = await satuMakam(setup, { pemegangHak, email: "waris@contoh.id" });

    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: lokasiMitra.id, nomor: nomorMakam });

    // Every key the payload carries, wherever it sits in it, is one AC 2 allows.
    const boleh = new Set<string>(KUNCI_HASIL_CARI_MAKAM);
    expect(kunciDiDalam(hasil).filter((key) => !boleh.has(key)), "a key the family was never meant to be given").toEqual([]);
    // And no Pemegang Hak value is in it: not a name, not a phone number, not an email, hidden or nested.
    const json = JSON.stringify(hasil);
    for (const nilai of [pemegangHak, "waris@contoh.id", "6281234567891", "081234567891"]) {
      expect(json, `the Pemegang Hak's ${nilai}: this must never reach a family's payload`).not.toContain(nilai);
    }
  });

  it("answers a match inside a Kavling Keluarga with the whole kavling, every Petak in it", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra, cells, kavlingId, nomorKavling } = await satuKavling(setup);

    // Asked for one member Petak's number, the family is shown the whole Kavling: one Hak Pakai, one Perpanjangan.
    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: lokasiMitra.id, nomor: cells[0].nomorMakam! });

    expect(hasil).toEqual({
      ok: true,
      ditemukan: [
        {
          hakPakaiId: expect.any(String),
          lokasiId: lokasiMitra.id,
          kavlingId,
          nomorKavling,
          petak: [
            { petakId: cells[0].id, nomorMakam: cells[0].nomorMakam, almarhum: ["Hasan"], statusHakPakai: "aktif", tanggalBerakhir: "2027-03-01" },
            { petakId: cells[1].id, nomorMakam: cells[1].nomorMakam, almarhum: [], statusHakPakai: "aktif", tanggalBerakhir: "2027-03-01" },
          ],
        },
      ],
    });
  });

  it("finds a Kavling Keluarga by its Nomor Kavling, whatever case it is typed in", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra, kavlingId, nomorKavling } = await satuKavling(setup);

    const hasil = await setup.inventory.cariMakam({
      ip: IP,
      bentuk: "nomor_kavling",
      lokasiId: lokasiMitra.id,
      nomor: `  ${nomorKavling.toLowerCase()}  `,
    });

    expect(hasil).toMatchObject({ ok: true, ditemukan: [{ kavlingId, nomorKavling }] });
    if (!hasil.ok) throw new Error("unreachable");
    expect(hasil.ditemukan[0]?.petak).toHaveLength(2);
  });

  it("finds a Petak nobody has bought under no number, so a free plot cannot be told from one that was never used", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup, { cols: 2 });
    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[0].id, { mode: "terisi", dataMenyusul: false, pemegangHak: { name: "Siti Aminah", phoneNumber: "081234567891" }, pemakaman: { almarhumName: "Abdullah", date: "2020-06-15" } });

    const kosong = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: fixture.lokasiMitra.id, nomor: cells[1].nomorMakam! });
    const tidakAda = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: fixture.lokasiMitra.id, nomor: "Z-999" });

    // The same answer, so the answer itself says nothing about which numbers exist at a Lokasi Mitra.
    expect(kosong).toEqual(tidakAda);
    expect(kosong).toEqual({ ok: true, ditemukan: [] });
  });
});

describe("a family looking for a grave by the Almarhum's name and the year they died", () => {
  it("finds it whatever case and spacing the name is typed in", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra, nomorMakam } = await satuMakam(setup, { almarhum: "Siti Aminah", tanggal: "2019-04-02", pemegangHak: "Bapak Umar" });

    const hasil = await setup.inventory.cariMakam({
      ip: IP,
      bentuk: "nama",
      lokasiId: lokasiMitra.id,
      nama: "  siti   aminah ",
      tahun: 2019,
    });

    expect(hasil).toMatchObject({ ok: true, ditemukan: [{ petak: [{ nomorMakam, almarhum: ["Siti Aminah"] }] }] });
  });

  it("finds it when the name is typed the other way round", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra } = await satuMakam(setup, { almarhum: "Siti Aminah", tanggal: "2019-04-02", pemegangHak: "Bapak Umar" });

    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nama", lokasiId: lokasiMitra.id, nama: "Aminah Siti", tahun: 2019 });

    expect(hasil).toMatchObject({ ok: true, ditemukan: [{ petak: [{ almarhum: ["Siti Aminah"] }] }] });
  });

  it("misses a part of a name, so a common first name cannot return a page of strangers", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup, { cols: 2 });
    const isi = async (petakId: string, almarhumName: string) => {
      const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, petakId, {
        mode: "terisi",
        dataMenyusul: false,
        pemegangHak: { name: "Siti Aminah", phoneNumber: "081234567891" },
        pemakaman: { almarhumName, date: "2019-04-02" },
      });
      if (!diisi.ok) throw new Error("unreachable");
    };
    await isi(cells[0].id, "Hasan Basri");
    await isi(cells[1].id, "Hasanuddin");

    // "Hasan" is a part of both names and the whole of neither.
    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nama", lokasiId: fixture.lokasiMitra.id, nama: "Hasan", tahun: 2019 });

    expect(hasil).toEqual({ ok: true, ditemukan: [] });
  });

  it("misses a name that is a piece of another, never a fragment of it", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra } = await satuMakam(setup, { almarhum: "Sudirman", tanggal: "2019-04-02", pemegangHak: "Bapak Umar" });

    const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nama", lokasiId: lokasiMitra.id, nama: "Sudir", tahun: 2019 });

    expect(hasil).toEqual({ ok: true, ditemukan: [] });
  });

  it("takes what a person typed literally: % and _ match no grave rather than every grave", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup, { cols: 2 });
    for (const [index, almarhumName] of ["Siti Nur", "Abdullah"].entries()) {
      const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[index].id, {
        mode: "terisi",
        dataMenyusul: false,
        pemegangHak: { name: "Bapak Umar", phoneNumber: "081234567891" },
        pemakaman: { almarhumName, date: "2019-04-02" },
      });
      if (!diisi.ok) throw new Error(`Petak refused: ${diisi.reason}`);
    }

    for (const nama of ["%", "_", "%A%", "\\", "A_ullah"]) {
      const hasil = await setup.inventory.cariMakam({ ip: IP, bentuk: "nama", lokasiId: fixture.lokasiMitra.id, nama, tahun: 2019 });
      expect(hasil, `typing ${nama} matched something`).toEqual({ ok: true, ditemukan: [] });
    }
  });

  it("looks in the year that was asked for and nowhere else", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { lokasiMitra } = await satuMakam(setup, { almarhum: "Siti Aminah", tanggal: "2019-04-02", pemegangHak: "Bapak Umar" });

    const tahunSalah = await setup.inventory.cariMakam({ ip: IP, bentuk: "nama", lokasiId: lokasiMitra.id, nama: "Siti Aminah", tahun: 2020 });

    expect(tahunSalah).toEqual({ ok: true, ditemukan: [] });
  });
});

describe("the per-IP limit on the lookup, so a cemetery's grave numbers cannot be guessed through", () => {
  /** Ten guesses, none of which needs to be right: an enumeration is made of misses. */
  async function tebakSepuluh(setup: InventorySetup, ip: string) {
    const hasil = [];
    for (let nomor = 1; nomor <= 10; nomor += 1) {
      hasil.push(await setup.inventory.cariMakam({ ip, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: `A-${nomor}` }));
    }
    return hasil;
  }

  it("answers ten lookups from one IP and refuses the eleventh, naming the moment it may try again", async () => {
    const setup = inventoryOnTestDatabase(db);
    const sepuluh = await tebakSepuluh(setup, IP);
    expect(sepuluh.filter((satu) => satu.ok)).toHaveLength(CARI_MAKAM_MAKS_PER_IP);

    const kesebelas = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-11" });

    // The refusal says nothing about whether A-11 exists: it was never looked up.
    expect(kesebelas).toEqual({ ok: false, reason: "terlalu_sering", retryAt: expect.any(Date) });
    const retryAt = (kesebelas as { retryAt: Date }).retryAt;
    expect(retryAt.getTime()).toBeGreaterThan(setup.clock.now().getTime());
  });

  it("counts a miss exactly as it counts a hit, and the refusal carries nothing but a time", async () => {
    const setup = inventoryOnTestDatabase(db);
    await tebakSepuluh(setup, IP);

    const refused = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-11" });
    const boleh = new Set<string>(KUNCI_HASIL_CARI_MAKAM);
    expect(kunciDiDalam(refused).filter((key) => !boleh.has(key))).toEqual([]);
    expect(JSON.stringify(refused)).not.toContain("ditemukan");
  });

  it("leaves another IP alone: the limit counts one visitor's guesses, not everyone's", async () => {
    const setup = inventoryOnTestDatabase(db);
    await tebakSepuluh(setup, IP);

    const lain = await setup.inventory.cariMakam({ ip: "198.51.100.7", bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-1" });

    expect(lain).toEqual({ ok: true, ditemukan: [] });
  });

  it("opens again once the window has passed, and the clock is the injected one", async () => {
    const setup = inventoryOnTestDatabase(db);
    await tebakSepuluh(setup, IP);
    setup.clock.advance({ minutes: CARI_MAKAM_JENDELA_MENIT + 1 });

    const lagi = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-11" });

    expect(lagi).toEqual({ ok: true, ditemukan: [] });
  });

  it("ends the window exactly at its own length: a minute short of it the IP is still refused", async () => {
    const setup = inventoryOnTestDatabase(db);
    await tebakSepuluh(setup, IP);
    // A refused attempt is not recorded, so the ten that fill the window are still the ten
    // from the start: at exactly the window's length they are all out of it, and a minute
    // before it none of them is. That is the boundary, and `gt` is what makes it a boundary —
    // a `gte` here would refuse a family one minute past what the page told it.
    setup.clock.advance({ minutes: CARI_MAKAM_JENDELA_MENIT - 1 });

    const sebelum = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-11" });
    expect(sebelum).toEqual({ ok: false, reason: "terlalu_sering", retryAt: expect.any(Date) });

    setup.clock.advance({ minutes: 1 });
    const tepat = await setup.inventory.cariMakam({ ip: IP, bentuk: "nomor_makam", lokasiId: "00000000-0000-0000-0000-000000000000", nomor: "A-11" });
    expect(tepat).toEqual({ ok: true, ditemukan: [] });
  });

  it("forgets the attempts older than 24 hours and keeps the rest, and the worker runs it", async () => {
    const setup = inventoryOnTestDatabase(db);
    await tebakSepuluh(setup, IP);
    setup.clock.advance({ hours: 23 });
    await tebakSepuluh(setup, "198.51.100.7");
    const t1 = setup.clock.now();

    const tick = scheduledTicks.find((scheduled) => scheduled.name === "inventory.prune_cari_makam_attempts");
    if (!tick) throw new Error("the worker does not schedule the tick that prunes the lookup attempts");
    await tick.tick({ db } as never, new Date(t1.getTime() + 2 * 3_600_000));

    // The ten from 25 hours ago are gone; the ten from 23 hours ago are still on record, and a
    // second run for the same moment deletes nothing (the tick is idempotent).
    expect(await pruneCariMakamAttempts({ db }, new Date(t1.getTime() + 2 * 3_600_000))).toEqual({ deleted: 0 });
    expect(await pruneCariMakamAttempts({ db }, new Date(t1.getTime() + 25 * 3_600_000))).toEqual({ deleted: 10 });
  });
});

describe("the Makam tab of a signed-in Akun (CONTEXT.md: a Hak Pakai shows in the Akun whose Email Terverifikasi equals the recorded one)", () => {
  it("lists the graves whose current Pemegang Hak recorded that email, and nobody else's", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup, { cols: 2 });
    const isi = async (petakId: string, email: string) => {
      const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, petakId, {
        mode: "terisi",
        dataMenyusul: false,
        pemegangHak: { name: "Bapak Umar", phoneNumber: "081234567891", email },
        pemakaman: { almarhumName: "Siti Nur", date: "2019-04-02" },
      });
      if (!diisi.ok) throw new Error(`Petak refused: ${diisi.reason}`);
    };
    await isi(cells[0].id, "waris@contoh.id");
    await isi(cells[1].id, "lain@contoh.id");

    const tab = await setup.inventory.makamPemegangHak({ email: "WARIS@CONTOH.ID" });

    expect(tab).toMatchObject([
      { lokasiId: fixture.lokasiMitra.id, petak: [{ nomorMakam: cells[0].nomorMakam, almarhum: ["Siti Nur"], statusHakPakai: "aktif" }] },
    ]);
    expect(tab).toHaveLength(1);
  });

  it("is empty for an email that holds nothing, rather than every grave at every Lokasi Mitra", async () => {
    const setup = inventoryOnTestDatabase(db);
    await satuMakam(setup, { email: "waris@contoh.id" });

    expect(await setup.inventory.makamPemegangHak({ email: "tidak@punyakontoh.id" })).toEqual([]);
    expect(await setup.inventory.makamPemegangHak({ email: "bukan email" })).toEqual([]);
  });
});
