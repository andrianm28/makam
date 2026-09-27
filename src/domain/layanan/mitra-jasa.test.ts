import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { newTpuDki } from "../../../tests/support/lokasi";
import {
  layananOnTestDatabase,
  mitraJasaLengkap,
  newLokasiMitra,
  newMitraJasaInput,
  newPekerjaan,
  rekeningSesuaiKtp,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInMitraJasa,
  type LayananSetup,
} from "../../../tests/support/layanan";
import { wib } from "@/lib/time/jakarta";
import { buktiOf } from "@/domain/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/** The two staff actors a Mitra Jasa test needs: the Operator's, and the petugas who is not one. */
async function withAdminDanLainnya(setup: LayananSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  await setup.identity.inviteStaff(admin, { email: "petugas@contoh.id", phoneNumber: "084444444444", role: "petugas_lapangan" });
  const petugas = await actorOf(setup.identity, (await logIn(setup, "petugas@contoh.id")).cookies);
  return { admin, petugas };
}

describe("onboarding a Mitra Jasa", () => {
  it("carries the profile, the three files, the bank account in the KTP name and both coverage lists, and takes no NPWP", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { varian } = await newLayananForAdmin(setup, admin);
    const tpu = await newTpuDki(setup, admin);

    const dibuat = await setup.layanan.buatMitraJasa(admin, "Siti.Rahayu@contoh.id", {
      ...newMitraJasaInput({ nik: "3201014503900001" }),
      kontakSiagaNama: "Bapak Rahayu",
      kontakSiagaTelepon: "081298765432",
    });
    if (!dibuat.ok) throw new Error(dibuat.reason);
    const id = dibuat.mitraJasaId;
    for (const jenis of ["ktp", "foto"] as const) {
      expect(await setup.layanan.unggahBerkas(admin, id, { jenis, file: { body: jpeg(), contentType: "image/jpeg" } })).toEqual({ ok: true });
    }
    expect(
      await setup.layanan.unggahBerkas(admin, id, {
        jenis: "perjanjian",
        file: { body: new TextEncoder().encode("%PDF-1.7"), contentType: "application/pdf" },
        signedOn: "2026-09-20",
      }),
    ).toEqual({ ok: true });
    expect(await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp("Siti Rahayu"))).toEqual({ ok: true });
    expect(await setup.layanan.ubahCoverage(admin, id, { tpuDkiIds: [tpu.id], layananVariantIds: [varian.id] })).toEqual({ ok: true });

    const dibaca = await setup.layanan.bacaMitraJasa(admin, id);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa).toMatchObject({
      email: "siti.rahayu@contoh.id",
      namaLengkap: "Siti Rahayu",
      nik: "3201014503900001",
      area: "Jakarta Timur",
      ktp: { ada: true },
      foto: { ada: true },
      perjanjian: { signedOn: "2026-09-20", scanUploaded: true },
      rekening: { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Siti Rahayu", catatanOverride: null },
      kontakSiaga: { name: "Bapak Rahayu", phoneNumber: "081298765432" },
      status: "aktif",
      coverage: { tpuDkiIds: [tpu.id], layananVariantIds: [varian.id] },
    });
    // A profile with all nine steps filled owes nothing, so the Tier 4 onboarding row is closed.
    expect(await setup.layanan.mitraJasaBelumLengkap(admin)).toEqual([]);
    expect(await setup.layanan.mitraJasaCountByStatus(admin)).toEqual({ aktif: 1, ditangguhkan: 0, berhenti: 0 });
  });

  it("refuses a payload carrying an NPWP: there is no such field, so none can be stored", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const denganNpwp = await setup.layanan.buatMitraJasa(admin, "mitra@contoh.id", {
      ...newMitraJasaInput(),
      npwp: "09.254.194.3-407.000",
    });

    expect(denganNpwp).toEqual({ ok: false, reason: "mitra_jasa_tidak_valid" });
    expect(await setup.layanan.semuaMitraJasa(admin)).toEqual([]);
  });

  it("needs no emergency contact, and refuses a NIK that is not 16 digits", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const tanpaKontak = await setup.layanan.buatMitraJasa(admin, "mitra@contoh.id", newMitraJasaInput());
    const nikPendek = await setup.layanan.buatMitraJasa(admin, "lain@contoh.id", newMitraJasaInput({ nik: "320101450390000" }));

    expect(tanpaKontak.ok).toBe(true);
    expect(nikPendek).toEqual({ ok: false, reason: "mitra_jasa_tidak_valid" });
    if (!tanpaKontak.ok) return;
    const dibaca = await setup.layanan.bacaMitraJasa(admin, tanpaKontak.mitraJasaId);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa.kontakSiaga).toEqual({ name: null, phoneNumber: null });
  });

  it("refuses the same NIK or the same email twice: one person, one record", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const nik = "3201014503900007";
    await setup.layanan.buatMitraJasa(admin, "satu@contoh.id", newMitraJasaInput({ nik }));

    // The same address, and the same person under another address: both are the same Mitra Jasa.
    expect(await setup.layanan.buatMitraJasa(admin, "satu@contoh.id", newMitraJasaInput())).toEqual({ ok: false, reason: "sudah_ada" });
    expect(await setup.layanan.buatMitraJasa(admin, "dua@contoh.id", newMitraJasaInput({ nik }))).toEqual({ ok: false, reason: "sudah_ada" });
    expect(await setup.layanan.semuaMitraJasa(admin)).toHaveLength(1);
  });

  it("refuses every other role, and keeps and audits nothing", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, petugas } = await withAdminDanLainnya(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const mitra = await signedInMitraJasa(setup, admin);

    for (const who of [petugas, adminLokasi, mitra]) {
      expect(await setup.layanan.buatMitraJasa(who, "baru@contoh.id", newMitraJasaInput())).toEqual({
        ok: false,
        reason: "tidak_berwenang",
      });
    }
    expect(await setup.layanan.semuaMitraJasa(admin)).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "mitra_jasa", id: "baru@contoh.id" })).toEqual([]);
  });

  it("audits the onboarding record and every change to it", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const dibuat = await setup.layanan.buatMitraJasa(admin, "mitra@contoh.id", newMitraJasaInput());
    if (!dibuat.ok) throw new Error(dibuat.reason);
    await setup.layanan.ubahRekening(admin, dibuat.mitraJasaId, rekeningSesuaiKtp("Siti Rahayu", { catatanOverride: "Atas nama istri" }));
    await setup.layanan.ubahStatus(admin, dibuat.mitraJasaId, { status: "ditangguhkan", alasan: "Keluhan upheld" });

    const entries = await setup.audit.entriesAbout({ kind: "mitra_jasa", id: dibuat.mitraJasaId });
    expect(entries.map((entry) => entry.action)).toEqual(["mitra_jasa.buat", "mitra_jasa.ubah_rekening", "mitra_jasa.ubah_status"]);
    expect(entries[0]).toMatchObject({ actor: { accountId: admin.accountId, role: "admin_platform" }, after: { status: "aktif" } });
    expect(entries[1]).toMatchObject({ after: { rekening: { catatanOverride: "Atas nama istri" } } });
    expect(entries[2]).toMatchObject({ before: { status: "aktif" }, after: { status: "ditangguhkan" }, reason: "Keluhan upheld" });
  });
});

describe("the Mitra Jasa bank account rule", () => {
  it("refuses an account name that is not the KTP's, and takes it with an override note", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const dibuat = await setup.layanan.buatMitraJasa(admin, "mitra@contoh.id", newMitraJasaInput({ namaLengkap: "Siti Rahayu" }));
    if (!dibuat.ok) throw new Error(dibuat.reason);
    const id = dibuat.mitraJasaId;

    // The same person, differently written: case and spacing are not a different name.
    expect(await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp("  siti   rahayu "))).toEqual({ ok: true });
    // Somebody else's account, with no note: refused, and nothing is written.
    expect(await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp("Budi Santoso"))).toEqual({
      ok: false,
      reason: "nama_rekening_tidak_cocok",
    });
    // The same, with the note the spec asks for.
    expect(
      await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp("Budi Santoso", { catatanOverride: "Rekening belonging, KTP is Siti Rahayu" })),
    ).toEqual({ ok: true });

    const dibaca = await setup.layanan.bacaMitraJasa(admin, id);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa.rekening).toEqual({
      bankName: "BSI",
      accountNumber: "7123456789",
      accountHolder: "Budi Santoso",
      catatanOverride: "Rekening belonging, KTP is Siti Rahayu",
    });
  });

  it("refuses a malformed account whatever the name says", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const dibuat = await setup.layanan.buatMitraJasa(admin, "mitra@contoh.id", newMitraJasaInput());
    if (!dibuat.ok) throw new Error(dibuat.reason);

    expect(await setup.layanan.ubahRekening(admin, dibuat.mitraJasaId, rekeningSesuaiKtp("Siti Rahayu", { accountNumber: "7123" }))).toEqual({
      ok: false,
      reason: "rekening_tidak_valid",
    });
  });
});

describe("Tidak tersedia, which a Mitra Jasa sets themselves", () => {
  it("keeps their own range, refuses one that overlaps it, and takes it off again", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitra = await mitraJasaMasuk(setup, admin);

    const ditambah = await setup.layanan.tambahTidakTersedia(mitra, { dari: "2026-10-03", sampai: "2026-10-07", alasan: "Kota Elsewhere" });
    if (!ditambah.ok || !("range" in ditambah)) throw new Error("range refused");
    expect(ditambah.range).toMatchObject({ dari: "2026-10-03", sampai: "2026-10-07", alasan: "Kota Elsewhere" });

    expect(await setup.layanan.tambahTidakTersedia(mitra, { dari: "2026-10-07", sampai: "2026-10-09" })).toEqual({
      ok: false,
      reason: "sudah_tidak_tersedia",
    });
    expect(await setup.layanan.tambahTidakTersedia(mitra, { dari: "2026-10-09", sampai: "2026-10-03" })).toEqual({
      ok: false,
      reason: "tidak_tersedia_tidak_valid",
    });
    expect(await setup.layanan.rentangTidakTersedia(mitra)).toHaveLength(1);

    expect(await setup.layanan.hapusTidakTersedia(mitra, ditambah.range.id)).toEqual({ ok: true });
    expect(await setup.layanan.rentangTidakTersedia(mitra)).toEqual([]);
  });

  it("is refused to anyone but a Mitra Jasa, and is a range of their own only", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, petugas } = await withAdminDanLainnya(setup);
    const mitraLain = await mitraJasaMasuk(setup, admin, "lain@contoh.id");
    const range = await setup.layanan.tambahTidakTersedia(mitraLain, { dari: "2026-10-03", sampai: "2026-10-07" });
    if (!range.ok || !("range" in range)) throw new Error("range refused");

    expect(await setup.layanan.tambahTidakTersedia(admin, { dari: "2026-10-20", sampai: "2026-10-21" })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.layanan.tambahTidakTersedia(petugas, { dari: "2026-10-20", sampai: "2026-10-21" })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    // The Admin Platform's read of it is not the Mitra Jasa's: the ranges are their own.
    expect(await setup.layanan.rentangTidakTersedia(admin)).toEqual([]);
  });
});

describe("which Mitra Jasa the assignment picker may offer a job to", () => {
  it("leaves out anyone Ditangguhan or Berhenti, anyone not covering that TPU or that Layanan, and anyone away on the date", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { varian } = await newLayananForAdmin(setup, admin);
    const tpu = await newTpuDki(setup, admin);
    const tpuLain = await newTpuDki(setup, admin, "TPU Lain");
    const layananLain = (await newLayananForAdmin(setup, admin, "Perawatan Rumput & Taman", "perawatan")).layananId;
    const varianLain = await newVarianOf(setup, admin, layananLain);

    const cakupan = await mitraJasaLengkap(setup, admin, { email: "cakupan@contoh.id", namaLengkap: "Aminah", tpuDkiId: tpu.id, layananVariantId: varian.id });
    const suspended = await mitraJasaLengkap(setup, admin, { email: "suspended@contoh.id", namaLengkap: "Bambang", tpuDkiId: tpu.id, layananVariantId: varian.id });
    const ended = await mitraJasaLengkap(setup, admin, { email: "ended@contoh.id", namaLengkap: "Citra", tpuDkiId: tpu.id, layananVariantId: varian.id });
    const tpuSalah = await mitraJasaLengkap(setup, admin, { email: "tpu-salah@contoh.id", namaLengkap: "Dewi", tpuDkiId: tpuLain.id, layananVariantId: varian.id });
    const layananSalah = await mitraJasaLengkap(setup, admin, { email: "layanan-salah@contoh.id", namaLengkap: "Endang", tpuDkiId: tpu.id, layananVariantId: varianLain });
    const jauh = await mitraJasaLengkap(setup, admin, { email: "jauh@contoh.id", namaLengkap: "Farida", tpuDkiId: tpu.id, layananVariantId: varian.id });

    expect(await setup.layanan.ubahStatus(admin, suspended.id, { status: "ditangguhkan", alasan: "Keluhan upheld" })).toMatchObject({ ok: true });
    expect(await setup.layanan.ubahStatus(admin, ended.id, { status: "berhenti", alasan: "Berhenti bekerja" })).toMatchObject({ ok: true });
    const away = await setup.layanan.tambahTidakTersedia(await masukSebagai(setup, cakupan.email), { dari: "2026-10-05", sampai: "2026-10-07" });
    expect(away.ok).toBe(true);
    await setup.layanan.tambahTidakTersedia(await masukSebagai(setup, jauh.email), { dari: "2026-10-20", sampai: "2026-10-22" });

    const tFilters = (tanggal: string) => ({ tpuDkiId: tpu.id, layananVariantId: varian.id, tanggal });
    // Inside the range only the one who is away later is offered.
    expect((await setup.layanan.mitraJasaTersedia(admin, tFilters("2026-10-06"))).map((satu) => satu.namaLengkap)).toEqual(["Farida"]);
    // The day before the range and the day after it are both offered, the range being inclusive.
    for (const tanggal of ["2026-10-04", "2026-10-08"]) {
      expect((await setup.layanan.mitraJasaTersedia(admin, tFilters(tanggal))).map((satu) => satu.namaLengkap)).toEqual([
        "Aminah",
        "Farida",
      ]);
    }
    // A job at another TPU, or for another Layanan variant, is a different question.
    expect(await setup.layanan.mitraJasaTersedia(admin, { tpuDkiId: tpuLain.id, layananVariantId: varian.id, tanggal: "2026-10-06" })).toEqual([
      expect.objectContaining({ email: tpuSalah.email }),
    ]);
    expect(await setup.layanan.mitraJasaTersedia(admin, { tpuDkiId: tpu.id, layananVariantId: varianLain, tanggal: "2026-10-06" })).toEqual([
      expect.objectContaining({ email: layananSalah.email }),
    ]);
    // A suspended or ended Mitra Jasa is never offered work, on any date.
    expect(
      (await setup.layanan.mitraJasaTersedia(admin, { tpuDkiId: tpu.id, layananVariantId: varian.id, tanggal: "2026-11-01" })).map((satu) => satu.email),
    ).not.toContain(suspended.email);
  });

  it("is a question only Admin Platform asks, and answers nothing for anyone else", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, petugas } = await withAdminDanLainnya(setup);
    const { varian } = await newLayananForAdmin(setup, admin);
    const tpu = await newTpuDki(setup, admin);
    const mitra = await signedInMitraJasa(setup, admin);
    await mitraJasaLengkap(setup, admin, { email: mitra.email, tpuDkiId: tpu.id, layananVariantId: varian.id });

    const kebutuhan = { tpuDkiId: tpu.id, layananVariantId: varian.id, tanggal: "2026-10-06" };
    expect((await setup.layanan.mitraJasaTersedia(admin, kebutuhan)).map((satu) => satu.email)).toEqual([mitra.email]);
    expect(await setup.layanan.mitraJasaTersedia(mitra, kebutuhan)).toEqual([]);
    expect(await setup.layanan.mitraJasaTersedia(petugas, kebutuhan)).toEqual([]);
  });
});

describe("a Mitra Jasa's status, and the work it decides", () => {
  it("suspension releases every Dijadwalkan job and lists the in-progress ones, in one transaction", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [
      newPekerjaan({ id: "dijadwalkan-1", status: "dijadwalkan", targetDate: "2026-10-05" }),
      newPekerjaan({ id: "dijadwalkan-2", status: "dijadwalkan", targetDate: "2026-10-08" }),
      newPekerjaan({ id: "dikerjakan", status: "dikerjakan", targetDate: "2026-10-01" }),
      newPekerjaan({ id: "selesai", status: "selesai", targetDate: "2026-09-20", dihitungPada: wib("2026-09-20 15:00") }),
    ]);

    const hasil = await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "ditangguhkan", alasan: "Keluhan upheld dua kali" });

    expect(hasil).toMatchObject({
      ok: true,
      dilepas: [
        { id: "dijadwalkan-1", targetDate: "2026-10-05" },
        { id: "dijadwalkan-2", targetDate: "2026-10-08" },
      ],
      berjalan: [{ id: "dikerjakan", targetDate: "2026-10-01" }],
    });
    expect(setup.pekerjaan.dilepas.map((satu) => satu.pekerjaanId)).toEqual(["dijadwalkan-1", "dijadwalkan-2"]);
    expect(setup.pekerjaan.dilepas[0]?.alasan).toContain("ditangguhkan");
    // The job already finished is not anyone's business but the record's.
    expect(setup.pekerjaan.dilepas.map((satu) => satu.pekerjaanId)).not.toContain("selesai");
    const dibaca = await setup.layanan.bacaMitraJasa(admin, mitraJasa.id);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa).toMatchObject({ status: "ditangguhkan", statusAlasan: "Keluhan upheld dua kali" });
  });

  it("ending for good releases the same jobs and says so in the reason", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [newPekerjaan({ id: "dijadwalkan-1", status: "dijadwalkan", targetDate: "2026-10-05" })]);

    const hasil = await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "berhenti", alasan: "Berhenti bekerja" });

    expect(hasil).toMatchObject({ ok: true, dilepas: [{ id: "dijadwalkan-1" }], berjalan: [] });
    expect(setup.pekerjaan.dilepas[0]?.alasan).toContain("berhenti");
  });

  it("reinstating takes no job off and needs no reason", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [newPekerjaan({ id: "dijadwalkan-1", status: "dijadwalkan", targetDate: "2026-10-05" })]);
    await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "ditangguhkan", alasan: "SempatPKM" });
    setup.pekerjaan.dilepas.length = 0;

    expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "aktif" })).toMatchObject({ ok: true, dilepas: [], berjalan: [] });
    expect(setup.pekerjaan.dilepas).toEqual([]);
  });

  it("a status change that cannot take a job off leaves the status exactly as it was", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [newPekerjaan({ id: "dijadwalkan-1", status: "dijadwalkan", targetDate: "2026-10-05" })]);
    setup.pekerjaan.gagalLepas(true);

    expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "ditangguhkan", alasan: "Keluhan upheld" })).toEqual({
      ok: false,
      reason: "pekerjaan_tidak_dilepas",
    });
    const dibaca = await setup.layanan.bacaMitraJasa(admin, mitraJasa.id);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa.status).toBe("aktif");
    expect((await setup.audit.entriesAbout({ kind: "mitra_jasa", id: mitraJasa.id })).map((entry) => entry.action)).not.toContain("mitra_jasa.ubah_status");
  });

  it("needs a reason to suspend or to end, refuses a status that is already there, and refuses everyone but Admin Platform", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, petugas } = await withAdminDanLainnya(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);

    expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "ditangguhkan" })).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "berhenti", alasan: "  " })).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "aktif" })).toEqual({ ok: false, reason: "status_sama" });
    expect(await setup.layanan.ubahStatus(petugas, mitraJasa.id, { status: "berhenti", alasan: "Sengaja" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.layanan.ubahStatus(admin, "00000000-0000-4000-8000-000000000000", { status: "berhenti", alasan: "x" })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });
});

describe("a Ditangguhan or Berhenti Mitra Jasa", () => {
  it("still signs in, and still sees their own history, scorecard and availability", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    const mitra = await signedInMitraJasa(setup, admin, mitraJasa.email);
    await setup.layanan.tambahTidakTersedia(mitra, { dari: "2026-10-03", sampai: "2026-10-07" });
    setup.pekerjaan.seed(mitraJasa.id, [
      newPekerjaan({ id: "selesai-1", status: "selesai", targetDate: "2026-09-20", dihitungPada: wib("2026-09-20 15:00"), penilaian: 5 }),
    ]);
    const { varian } = await newLayananForAdmin(setup, admin);
    const tpu = await newTpuDki(setup, admin);
    const cover = await setup.layanan.ubahCoverage(admin, mitraJasa.id, { tpuDkiIds: [tpu.id], layananVariantIds: [varian.id] });
    expect(cover.ok).toBe(true);

    for (const status of ["ditangguhkan", "berhenti"] as const) {
      expect(await setup.layanan.ubahStatus(admin, mitraJasa.id, { status, alasan: "Alasan" })).toMatchObject({ ok: true });
      // The account, the role and the session are untouched: only the work changed.
      const lagi = await masukSebagai(setup, mitraJasa.email, true);
      expect(lagi.roles).toContain("mitra_jasa");
      expect(await setup.layanan.rentangTidakTersedia(lagi)).toHaveLength(1);
      const skor = await setup.layanan.skorSaya(lagi);
      expect(skor).toMatchObject({ ok: true, skor: { selesai: 1, rataPenilaian: 5 } });
      // And they take no new work, on any date.
      expect(
        await setup.layanan.mitraJasaTersedia(admin, { tpuDkiId: tpu.id, layananVariantId: varian.id, tanggal: "2026-11-02" }),
      ).toEqual([]);
      await setup.layanan.ubahStatus(admin, mitraJasa.id, { status: "aktif" });
    }
  });
});

describe("the Baru badge", () => {
  it("shows until 5 Selesai, and only the finished jobs count", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    const selesai = (jumlah: number) =>
      Array.from({ length: jumlah }, (_, index) =>
        newPekerjaan({ id: `selesai-${index}`, status: "selesai", targetDate: "2026-09-20", dihitungPada: wib("2026-09-20 15:00") }),
      );
    const belum = [
      newPekerjaan({ id: "dijadwalkan-1", status: "dijadwalkan", targetDate: "2026-11-05" }),
      newPekerjaan({ id: "dikerjakan", status: "dikerjakan", targetDate: "2026-11-06" }),
    ];

    const badge = async () => {
      const dibaca = await setup.layanan.bacaMitraJasa(admin, mitraJasa.id);
      if (!dibaca.ok) throw new Error(dibaca.reason);
      return { baru: dibaca.mitraJasa.baru, selesai: dibaca.mitraJasa.selesai };
    };

    setup.pekerjaan.seed(mitraJasa.id, [...selesai(4), ...belum]);
    expect(await badge()).toEqual({ baru: true, selesai: 4 });
    setup.pekerjaan.seed(mitraJasa.id, selesai(1));
    expect(await badge()).toEqual({ baru: false, selesai: 5 });
    setup.pekerjaan.seed(mitraJasa.id, selesai(1));
    expect(await badge()).toEqual({ baru: false, selesai: 6 });
  });
});

describe("who may read a Mitra Jasa", () => {
  it("gives the list and each record to Admin Platform alone, and no Mitra Jasa another's", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, petugas } = await withAdminDanLainnya(setup);
    const satu = await mitraJasaLengkap(setup, admin, { email: "satu@contoh.id", namaLengkap: "Andi" });
    const dua = await mitraJasaLengkap(setup, admin, { email: "dua@contoh.id", namaLengkap: "Budi" });
    const mitraSatu = await signedInMitraJasa(setup, admin, satu.email);

    expect((await setup.layanan.semuaMitraJasa(admin)).map((satu) => satu.email)).toEqual(["satu@contoh.id", "dua@contoh.id"]);
    for (const who of [petugas, mitraSatu]) {
      expect(await setup.layanan.semuaMitraJasa(who)).toEqual([]);
      expect(await setup.layanan.bacaMitraJasa(who, satu.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
      expect(await setup.layanan.mitraJasaBelumLengkap(who)).toEqual([]);
      expect(await setup.layanan.tinjauanMitraJasa(who, satu.id)).toEqual([]);
      expect(await setup.layanan.mitraJasaCountByStatus(who)).toEqual({ aktif: 0, ditangguhkan: 0, berhenti: 0 });
    }
    // The scorecard is the exception, and only for their own: their own numbers are their own business.
    expect(await setup.layanan.skorMitraJasa(petugas, satu.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.layanan.skorMitraJasa(mitraSatu, satu.id)).toMatchObject({ ok: true });
    expect(await setup.layanan.skorMitraJasa(mitraSatu, dua.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.layanan.skorSaya(mitraSatu)).toMatchObject({ ok: true });
    expect(await setup.layanan.skorSaya(petugas)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

/* Helpers */

/** A Layanan with its first variant, made by `admin` through the module's own write. */
async function newLayananForAdmin(setup: LayananSetup, admin: Parameters<LayananSetup["layanan"]["createLayanan"]>[0], name = "Pembersihan Makam", jenis: "pembersihan" | "perawatan" = "pembersihan") {
  const dibuat = await setup.layanan.createLayanan(admin, {
    name,
    description: "Membersihkan dan merapikan makam.",
    jenis,
    bukti: buktiOf(jenis),
    leadTimeDays: 3,
    bisaHariH: false,
    adaDiPetakKosong: true,
    teksLabel: null,
    varian: ["Reguler"],
    reason: null,
  });
  if (!dibuat.ok) throw new Error(`Layanan refused: ${dibuat.reason}`);
  return { layananId: dibuat.layanan.id, varian: dibuat.layanan.varian[0], varianId: dibuat.layanan.varian[0].id };
}

/** One more variant of a Layanan, so two variants can be told apart in the picker. */
async function newVarianOf(setup: LayananSetup, admin: Parameters<LayananSetup["layanan"]["createLayanan"]>[0], layananId: string) {
  const ditambah = await setup.layanan.tambahVarian(admin, layananId, { name: "Lengkap", reason: null });
  if (!ditambah.ok) throw new Error(`varian refused: ${ditambah.reason}`);
  return ditambah.varian.id;
}

/**
 * A Mitra Jasa signed in on its own Akun, through a Kode Masuk, as a person would.
 * The second and later logins of one address move the Clock past the "Kirim ulang"
 * wait, which is what a person waiting a minute would do.
 */
async function masukSebagai(setup: LayananSetup, email: string, lagi: boolean = false) {
  if (lagi) setup.clock.advance({ minutes: 2 });
  return actorOf(setup.identity, (await logIn(setup, email)).cookies);
}

/**
 * A Mitra Jasa with a profile of their own, signed in: the range a person sets is
 * looked up by the email on their record, so an Akun that holds the role without
 * one has nothing to attach a range to.
 */
async function mitraJasaMasuk(setup: LayananSetup, admin: Parameters<LayananSetup["layanan"]["buatMitraJasa"]>[0], email = "mitra.jasa@contoh.id", options: { tpuDkiId?: string; layananVariantId?: string } = {}) {
  if (options.tpuDkiId && options.layananVariantId) {
    await mitraJasaLengkap(setup, admin, { ...options, email });
  } else {
    const dibuat = await setup.layanan.buatMitraJasa(admin, email, newMitraJasaInput());
    if (!dibuat.ok) throw new Error(`Mitra Jasa refused: ${dibuat.reason}`);
  }
  return signedInMitraJasa(setup, admin, email);
}
