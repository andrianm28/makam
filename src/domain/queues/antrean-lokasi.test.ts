/**
 * The Antrean Lokasi (spec, Work Queues: "Antrean Lokasi: Mendesak: Konfirmasi
 * Saat Duka; … Lainnya: … failed Lokasi-message calls; Petak Perlu
 * Verifikasi", and the Admin Platform Tier 1 "Konfirmasi Lokasi terlambat";
 * ticket 23). A projection like the Antrean: rows only, no Ambil claims, no
 * tiers, no Bertugas, and every row closes itself as the state moves on.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { PENGATURAN_OPERATOR } from "../../../tests/support/billing";
import { orderSaatDuka, saatDukaFixture, terverifikasiLokasi } from "../../../tests/support/pemesanan";
import { queuesOnTestDatabase, type AntreanLokasiSetup } from "../../../tests/support/queues";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Pengaturan Operator, entered by the Admin Platform the first Lokasi fixture seeded. */
async function siapkanOperator(setup: AntreanLokasiSetup, admin: Actor) {
  const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
}

/** Work Queues with the Pemesanan module beside it, as the runtime composes them. */
function setupAntrean(): AntreanLokasiSetup {
  return queuesOnTestDatabase(db);
}

/** One placed Saat Duka order at the fixture's Lokasi Mitra, with Pengaturan Operator filled. */
async function pesananMenungguKonfirmasi(setup: AntreanLokasiSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperator(setup, fixture.admin);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor };
}

describe("the Antrean Lokasi of one Lokasi Mitra", () => {
  it("lists a waiting order under Mendesak with the deadline its Jam Operasional gave, and nothing for another Lokasi", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await pesananMenungguKonfirmasi(pemesanan);
    const lain = await terverifikasiLokasi(pemesanan, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    const antrean = await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id);

    expect(antrean.mendesak).toEqual([
      expect.objectContaining({
        type: "konfirmasi_saat_duka",
        subjectKind: "pemesanan_makam",
        subjectId: expect.any(String),
        deadline: wib("2026-10-01 11:00"),
        pastDeadline: false,
      }),
    ]);
    expect(antrean.mendesak[0]?.href).toBe(`/staf/admin-lokasi/${fixture.lokasiMitra.id}/pesanan/${fixture.nomor}`);
    // Another Lokasi Mitra's Admin Lokasi sees their own empty list, never this family's.
    expect(await setup.queues.antreanLokasi(lain.adminLokasi, lain.lokasiMitra.id)).toMatchObject({ mendesak: [], lainnya: [] });
    expect(await setup.queues.antreanLokasi(lain.adminLokasi, fixture.lokasiMitra.id)).toMatchObject({ mendesak: [], lainnya: [] });
  });

  it("marks the row past its deadline once the Clock is past it, and the row has no claim, tier or alert", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await pesananMenungguKonfirmasi(pemesanan);

    setup.clock.set(wib("2026-10-01 11:30"));
    const [row] = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).mendesak;

    expect(row).toMatchObject({ pastDeadline: true });
    // Rows only: the Antrean Lokasi has no Ambil claim, no tier and no Bertugas.
    expect(row).not.toHaveProperty("ambil");
    expect(row).not.toHaveProperty("tier");
    expect(row).not.toHaveProperty("alerts");
  });

  it("closes the row by itself once the Lokasi confirms the order", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await pesananMenungguKonfirmasi(pemesanan);
    const [blok] = await pemesanan.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const [petak] = (await cellsOf(pemesanan, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");

    const hasil = await pemesanan.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: fixture.nomor,
      petakId: petak!.id,
      pemakamanAt: "2026-10-02T10:00",
    });

    expect(hasil.ok).toBe(true);
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).mendesak).toEqual([]);
  });

  it("lists Petak Perlu Verifikasi under Lainnya, by its own count, and closes as they are cleared", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await saatDukaFixture(pemesanan);
    // The fixture's Blok is cleared; a freshly drawn one is not.
    const baru = await pemesanan.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "B",
      rows: 2,
      cols: 2,
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!baru.ok) throw new Error(`Blok refused: ${baru.reason}`);

    const lain = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya;
    expect(lain).toEqual([
      expect.objectContaining({ type: "petak_perlu_verifikasi", subjectKind: "lokasi_mitra", subjectId: fixture.lokasiMitra.id, deadline: null }),
    ]);
    expect(lain[0]?.subjectLabel).toContain("4");

    for (const cell of (await cellsOf(pemesanan, fixture.adminLokasi, fixture.lokasiMitra.id, baru.blok.id)).filter((one) => one.kind === "petak")) {
      await pemesanan.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    }
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya).toEqual([]);
  });

  /** An occupied Petak whose 5-year Hak Pakai, from a burial on 2021-10-01, ends on 2026-10-01 (its Masa Tenggang, 3 months by default, ends on 2027-01-01). */
  async function hakPakaiBerakhir20261001(setup: AntreanLokasiSetup) {
    const fixture = await saatDukaFixture(setup);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const [petak] = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
    const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, petak!.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Budi Santoso", phoneNumber: "081234567890" },
    });
    if (!diisi.ok || !diisi.hakPakaiId) throw new Error("clearPetak refused");
    await setup.inventory.catatPemakaman(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId: diisi.hakPakaiId, almarhumName: "Siti Aminah", tanggal: "2021-10-01" });
    return { fixture, hakPakaiId: diisi.hakPakaiId };
  }

  it("lists a Hak Pakai in masa tenggang under Lainnya, and closes it when the Admin Lokasi ends it", async () => {
    const setup = setupAntrean();
    const { fixture, hakPakaiId } = await hakPakaiBerakhir20261001(setup);

    setup.clock.set(wib("2026-10-01 12:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya).toEqual([]);

    setup.clock.set(wib("2026-10-02 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    const lain = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya;
    expect(lain).toEqual([
      expect.objectContaining({ type: "hak_pakai_masa_tenggang", label: "Hak Pakai dalam masa tenggang", subjectKind: "hak_pakai", subjectId: hakPakaiId, deadline: null, href: `/staf/admin-lokasi/${fixture.lokasiMitra.id}/hak-pakai/${hakPakaiId}` }),
    ]);
    expect(lain[0]?.subjectLabel).toContain("1 Oktober 2026");
    expect(lain[0]?.subjectLabel).toContain("masa tenggang sampai 1 Januari 2027");

    await setup.inventory.akhiriHakPakaiManual(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, alasan: "Tidak diperpanjang" });
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya).toEqual([]);
  });

  it("keeps the Hak Pakai in masa tenggang row after the Masa Tenggang ends, until the Admin Lokasi ends the Hak Pakai (owner decision 2026-10-02)", async () => {
    const setup = setupAntrean();
    const { fixture, hakPakaiId } = await hakPakaiBerakhir20261001(setup);
    setup.clock.set(wib("2026-10-02 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());

    // The Masa Tenggang ended on 2027-01-01: the day after, and months later, the row is still the Admin Lokasi's to decide.
    for (const hariIni of ["2027-01-02 09:00", "2027-06-15 09:00"]) {
      setup.clock.set(wib(hariIni));
      const lain = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya;
      expect(lain, hariIni).toEqual([
        expect.objectContaining({ type: "hak_pakai_masa_tenggang", label: "Hak Pakai dalam masa tenggang", subjectKind: "hak_pakai", subjectId: hakPakaiId, deadline: null, href: `/staf/admin-lokasi/${fixture.lokasiMitra.id}/hak-pakai/${hakPakaiId}` }),
      ]);
      // It says the Masa Tenggang is over, not that it runs on.
      expect(lain[0]?.subjectLabel, hariIni).toContain("masa tenggang berakhir 1 Januari 2027");
      expect(lain[0]?.subjectLabel, hariIni).not.toContain("masa tenggang sampai");
    }

    await setup.inventory.akhiriHakPakaiManual(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, alasan: "Masa tenggang lewat, tidak diperpanjang" });
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya).toEqual([]);
  });

  it("lists a failed Lokasi-work message as a call row, and closes it once the call is logged", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await pesananMenungguKonfirmasi(pemesanan);
    // Every message keeps failing (the order's two Lokasi-work messages, four tries each): the family must be phoned.
    pemesanan.email.failNextSend(8);
    const [blok] = await pemesanan.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const [petak] = (await cellsOf(pemesanan, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
    await pemesanan.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: fixture.nomor,
      petakId: petak!.id,
      pemakamanAt: "2026-10-02T10:00",
    });
    for (let tick = 0; tick < 5; tick++) {
      pemesanan.clock.advance({ hours: 4 });
      await pemesanan.notifications.kirimPesanJatuhTempo(pemesanan.clock.now());
    }

    // Both Lokasi-work messages of that order failed for good: one call row each.
    const lain = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya;
    expect(lain).toHaveLength(2);
    expect(lain.every((row) => row.type === "pesan_lokasi_gagal" && row.subjectKind === "telepon_pemesan" && row.deadline === null)).toBe(true);
    // Admin Platform's Antrean keeps the money subjects only: these rows are the Lokasi's own work, and
    // the confirmation is one email (the Tagihan has none of its own), so no money call is opened.
    expect((await setup.queues.antrean(fixture.admin)).filter((row) => row.type === "telepon_pemesan")).toEqual([]);

    for (const row of lain) {
      const logged = await pemesanan.notifications.catatPanggilan(fixture.adminLokasi, {
        teleponId: row.subjectId,
        hasil: "sudah_dihubungi",
        catatan: "Keluarga sudah diberi tahu.",
      });
      expect(logged.ok).toBe(true);
    }
    expect((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya).toEqual([]);
  });
});

describe("a code that never left the relay", () => {
  it("a Kode Masuk whose send fails raises no call row in either Antrean (spec, Notifications: the Kode Masuk is not a message)", async () => {
    const setup = setupAntrean();
    const fixture = await saatDukaFixture(setup);
    setup.email.failNextSend();

    const gagal = await setup.identity.requestKodeMasuk({ email: "keluarga@contoh.id", ip: "198.18.7.7" });

    expect(gagal).toEqual({ ok: false, reason: "gagal_kirim" });
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
    expect(await setup.queues.antrean(fixture.admin)).toEqual([]);
    expect(await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).toMatchObject({
      mendesak: [],
      lainnya: [],
    });
  });
});

describe("the Admin Platform Antrean's Tier 1 Konfirmasi Lokasi terlambat row", () => {
  it("opens at the deadline, closes on confirmation, and never lets Admin Platform confirm", async () => {
    const pemesanan = setupAntrean();
    const setup = pemesanan;
    const fixture = await pesananMenungguKonfirmasi(pemesanan);
    const admin = fixture.admin;

    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "konfirmasi_lokasi_terlambat")).toEqual([]);

    // The row opens the moment the deadline arrives: at 11:00 it is due, half an hour later it is late.
    setup.clock.set(wib("2026-10-01 11:00"));
    const terbuka = (await setup.queues.antrean(admin)).filter((row) => row.type === "konfirmasi_lokasi_terlambat");
    expect(terbuka).toEqual([
      expect.objectContaining({
        tier: 1,
        subjectKind: "pemesanan_makam",
        subjectLabel: expect.stringContaining(fixture.nomor),
        deadline: wib("2026-10-01 11:00"),
        pastDeadline: false,
        alerts: true,
      }),
    ]);
    setup.clock.set(wib("2026-10-01 11:30"));
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "konfirmasi_lokasi_terlambat")).toEqual([
      expect.objectContaining({ pastDeadline: true }),
    ]);

    // Admin Platform phones the Lokasi and logs it; it may not confirm for it.
    const [row] = terbuka;
    const catatan = await setup.queues.tambahCatatanInternal(admin, {
      subjectKind: row!.subjectKind,
      subjectId: row!.subjectId,
      body: "Telepon Lokasi Mitra 10.15, mengonfirmasi sore ini.",
    });
    expect(catatan.ok).toBe(true);

    const [blok] = await pemesanan.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const [petak] = (await cellsOf(pemesanan, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
    expect(
      await pemesanan.pemesanan.konfirmasiSaatDuka(admin, {
        nomor: fixture.nomor,
        petakId: petak!.id,
        pemakamanAt: "2026-10-02T10:00",
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    await pemesanan.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: fixture.nomor,
      petakId: petak!.id,
      pemakamanAt: "2026-10-02T10:00",
    });
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "konfirmasi_lokasi_terlambat")).toEqual([]);
  });
});
