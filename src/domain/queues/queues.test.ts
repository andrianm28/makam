import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn, nextTestIp } from "../../../tests/support/identity";
import {
  newLokasiMitra,
  publishedLokasiMitra,
  queuesOnTestDatabase,
  readyToPublish,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInPetugasLapangan,
  tariffsCheckedFact,
  type QueuesSetup,
} from "../../../tests/support/queues";
import { authenticatorCode } from "../../../tests/support/totp";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const kunjunganUpload = { kind: "foto_lokasi", file: { body: jpegBytes, contentType: "image/jpeg" } };

/** A second Admin Platform: invited by `admin`, logged in and past its own TOTP, for Ambil's "takeable by anyone" test. */
async function secondAdminPlatform(setup: QueuesSetup, admin: Actor, email = "admin.dua@makam.co.id"): Promise<Actor> {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "082222222222", role: "admin_platform" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const enrolment = await setup.identity.startTotpEnrolment(await actorOf(setup.identity, cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await setup.identity.passTotp(await actorOf(setup.identity, cookies), authenticatorCode(enrolment.secret, setup.clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

describe("Antrean: Tier 4 Lokasi kunjungan ulang and syarat tayang ulang", () => {
  it("opens the revisit row only once a Kunjungan Verifikasi is requested on an already-published Lokasi, and closes it once Selesai", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, petugas } = await publishedLokasiMitra(setup, admin);

    expect((await setup.queues.antrean(admin)).filter((row) => row.subjectId === lokasiMitra.id)).toHaveLength(0);

    // Advance past the publish moment: the publish-gate-check row must only ever open for a revisit completed strictly after publish.
    setup.clock.advance({ minutes: 5 });
    const revisit = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-10-10",
      assigneeAccountId: petugas.accountId,
    });
    if (!revisit.ok) throw new Error("unreachable");

    const withRevisit = await setup.queues.antrean(admin);
    const revisitRow = withRevisit.find((row) => row.type === "lokasi_kunjungan_ulang" && row.subjectId === lokasiMitra.id);
    expect(revisitRow).toMatchObject({ tier: 4, subjectLabel: lokasiMitra.name, alerts: false, ambil: null });
    expect(withRevisit.some((row) => row.type === "lokasi_syarat_tayang_ulang")).toBe(false);

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, revisit.tugasLapangan.id, {
      form: { addressConfirmed: true, pin: lokasiMitra.pin, facilities: { checked: [], note: "" }, note: "Masih sesuai" },
      uploads: [kunjunganUpload],
    });
    expect(completed.ok).toBe(true);

    const afterCompleted = await setup.queues.antrean(admin);
    expect(afterCompleted.some((row) => row.type === "lokasi_kunjungan_ulang")).toBe(false);
    const gateRow = afterCompleted.find((row) => row.type === "lokasi_syarat_tayang_ulang" && row.subjectId === lokasiMitra.id);
    expect(gateRow).toMatchObject({ tier: 4, subjectLabel: lokasiMitra.name, alerts: false });
  });

  it("closes the publish-gate check once Admin Platform confirms the gate is still met, and reopens after a later revisit completes", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, petugas } = await publishedLokasiMitra(setup, admin);

    setup.clock.advance({ minutes: 5 });
    const firstRevisit = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-10-10",
      assigneeAccountId: petugas.accountId,
    });
    if (!firstRevisit.ok) throw new Error("unreachable");
    await setup.fieldwork.completeTugasLapangan(petugas, firstRevisit.tugasLapangan.id, {
      form: { addressConfirmed: true, pin: lokasiMitra.pin, facilities: { checked: [], note: "" }, note: "" },
      uploads: [kunjunganUpload],
    });
    expect((await setup.queues.antrean(admin)).some((row) => row.type === "lokasi_syarat_tayang_ulang")).toBe(true);

    const confirmed = await setup.lokasi.recordPublishGateMasihTerpenuhi(admin, lokasiMitra.id);
    expect(confirmed).toEqual({ ok: true });
    expect((await setup.queues.antrean(admin)).some((row) => row.type === "lokasi_syarat_tayang_ulang")).toBe(false);

    setup.clock.advance({ minutes: 5 });
    const secondRevisit = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-10-20",
      assigneeAccountId: petugas.accountId,
    });
    if (!secondRevisit.ok) throw new Error("unreachable");
    await setup.fieldwork.completeTugasLapangan(petugas, secondRevisit.tugasLapangan.id, {
      form: { addressConfirmed: true, pin: lokasiMitra.pin, facilities: { checked: [], note: "" }, note: "" },
      uploads: [kunjunganUpload],
    });
    expect((await setup.queues.antrean(admin)).some((row) => row.type === "lokasi_syarat_tayang_ulang")).toBe(true);
  });

  it("never opens either row for a Belum Tayang Lokasi's own onboarding Kunjungan Verifikasi", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await readyToPublish(setup, admin, lokasiMitra.id);

    expect((await setup.queues.antrean(admin)).filter((row) => row.subjectId === lokasiMitra.id)).toHaveLength(0);

    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);
    const published = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });
    expect(published.ok).toBe(true);

    expect((await setup.queues.antrean(admin)).filter((row) => row.subjectId === lokasiMitra.id)).toHaveLength(0);
  });
});

describe("Antrean: Tier 4 other Tugas Lapangan", () => {
  it("shows an overdue Tugas Lapangan (any type but Ambil surat pengantar), and closes once it is Selesai", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const overdue = await setup.fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah",
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: null,
      plannedDate: "2026-09-20",
      assigneeAccountId: petugas.accountId,
    });
    if (!overdue.ok) throw new Error("unreachable");

    const rows = await setup.queues.antrean(admin);
    const row = rows.find((item) => item.type === "tugas_lapangan_lain" && item.subjectId === overdue.tugasLapangan.id);
    expect(row).toMatchObject({ tier: 4, subjectLabel: "Cek Denah", pastDeadline: true, alerts: false });

    await setup.fieldwork.completeTugasLapangan(petugas, overdue.tugasLapangan.id, {
      form: { sesuaiDenah: true, note: "" },
      uploads: [{ kind: "foto_denah", file: { body: jpegBytes, contentType: "image/jpeg" } }],
    });
    expect((await setup.queues.antrean(admin)).some((item) => item.subjectId === overdue.tugasLapangan.id)).toBe(false);
  });

  it("does not show a Tugas Lapangan that is neither overdue nor unassigned", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    await setup.fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah",
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: null,
      plannedDate: "2026-10-15",
      assigneeAccountId: petugas.accountId,
    });

    expect((await setup.queues.antrean(admin)).some((item) => item.type === "tugas_lapangan_lain")).toBe(false);
  });
});

describe("Antrean: sorting and deadlines", () => {
  it("sorts rows by deadline within a tier, and marks a row past its deadline (never one not yet due)", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiA = await newLokasiMitra(setup, admin, "Makam A");
    const lokasiB = await newLokasiMitra(setup, admin, "Makam B");

    const earlier = await setup.fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah A",
      lokasiId: lokasiA.id,
      address: lokasiA.address,
      pin: null,
      plannedDate: "2026-09-20",
      assigneeAccountId: petugas.accountId,
    });
    const later = await setup.fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah B",
      lokasiId: lokasiB.id,
      address: lokasiB.address,
      pin: null,
      plannedDate: "2026-09-25",
      assigneeAccountId: petugas.accountId,
    });
    if (!earlier.ok || !later.ok) throw new Error("unreachable");

    const rows = await setup.queues.antrean(admin);
    const other = rows.filter((row) => row.type === "tugas_lapangan_lain");
    expect(other.map((row) => row.subjectId)).toEqual([earlier.tugasLapangan.id, later.tugasLapangan.id]);
    expect(other.every((row) => row.pastDeadline)).toBe(true);
    expect(rows.every((row) => row.alerts === false)).toBe(true);
  });

  it("does not mark a row whose deadline is still ahead", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, petugas } = await publishedLokasiMitra(setup, admin);

    const revisit = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-10-15",
      assigneeAccountId: petugas.accountId,
    });
    if (!revisit.ok) throw new Error("unreachable");

    const row = (await setup.queues.antrean(admin)).find((item) => item.type === "lokasi_kunjungan_ulang");
    expect(row?.pastDeadline).toBe(false);
  });
});

describe("Antrean: Ambil", () => {
  it("any Admin Platform can take a row, including one already taken; each Ambil is logged in the Audit Log", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: adminA } = await signedInAdminPlatform(setup);
    const adminB = await secondAdminPlatform(setup, adminA);
    const { lokasiMitra, petugas } = await publishedLokasiMitra(setup, adminA);
    const revisit = await setup.fieldwork.createTugasLapangan(adminA, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-10-10",
      assigneeAccountId: petugas.accountId,
    });
    if (!revisit.ok) throw new Error("unreachable");
    const [row] = (await setup.queues.antrean(adminA)).filter((item) => item.type === "lokasi_kunjungan_ulang");
    expect(row.ambil).toBeNull();

    const firstAmbil = await setup.queues.ambilRow(adminA, { type: row.type, subjectId: row.subjectId });
    expect(firstAmbil.ok).toBe(true);
    const afterFirst = (await setup.queues.antrean(adminA)).find((item) => item.type === row.type && item.subjectId === row.subjectId);
    expect(afterFirst?.ambil?.accountId).toBe(adminA.accountId);

    const secondAmbil = await setup.queues.ambilRow(adminB, { type: row.type, subjectId: row.subjectId });
    expect(secondAmbil.ok).toBe(true);
    const afterSecond = (await setup.queues.antrean(adminA)).find((item) => item.type === row.type && item.subjectId === row.subjectId);
    expect(afterSecond?.ambil?.accountId).toBe(adminB.accountId);

    const entries = await setup.audit.entriesAbout({ kind: "antrean_row", id: `${row.type}:${row.subjectId}` });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.action)).toEqual(["antrean.ambil", "antrean.ambil"]);
    expect(entries.map((entry) => entry.actor.accountId)).toEqual([adminA.accountId, adminB.accountId]);
  });

  it("an Admin Lokasi cannot Ambil a row", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], "083333333344");

    const attempt = await setup.queues.ambilRow(adminLokasi, { type: "lokasi_kunjungan_ulang", subjectId: lokasiMitra.id });
    expect(attempt).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("Antrean: Catatan Internal", () => {
  it("Admin Platform adds a Catatan Internal on any row or order, hidden from every other staff role", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], "083333333344");
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.dua@contoh.id");

    const added = await setup.queues.tambahCatatanInternal(admin, {
      subjectKind: "lokasi_mitra",
      subjectId: lokasiMitra.id,
      body: "Diteruskan ke shift berikutnya",
    });
    expect(added.ok).toBe(true);

    const seenByAdmin = await setup.queues.catatanInternal(admin, "lokasi_mitra", lokasiMitra.id);
    expect(seenByAdmin).toHaveLength(1);
    expect(seenByAdmin[0]).toMatchObject({ body: "Diteruskan ke shift berikutnya", authorAccountId: admin.accountId });

    expect(await setup.queues.catatanInternal(adminLokasi, "lokasi_mitra", lokasiMitra.id)).toHaveLength(0);
    expect(await setup.queues.catatanInternal(petugas, "lokasi_mitra", lokasiMitra.id)).toHaveLength(0);

    expect(
      await setup.queues.tambahCatatanInternal(adminLokasi, { subjectKind: "lokasi_mitra", subjectId: lokasiMitra.id, body: "x" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.queues.tambahCatatanInternal(petugas, { subjectKind: "lokasi_mitra", subjectId: lokasiMitra.id, body: "x" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    const entries = await setup.audit.entriesAbout({ kind: "catatan_internal", id: seenByAdmin[0].id });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("catatan_internal.tulis");
  });

  it("also attaches to an order (any subjectKind), not only a row", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const added = await setup.queues.tambahCatatanInternal(admin, {
      subjectKind: "tagihan",
      subjectId: "TAG-2026-0001",
      body: "Sudah dikonfirmasi lewat telepon",
    });
    expect(added.ok).toBe(true);
    expect(await setup.queues.catatanInternal(admin, "tagihan", "TAG-2026-0001")).toHaveLength(1);
  });
});

describe("Antrean: counters", () => {
  it("counts rows past deadline; every other counter shows 0 until its own ticket fills it in", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah",
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: null,
      plannedDate: "2026-09-20",
      assigneeAccountId: petugas.accountId,
    });

    expect(await setup.queues.counters(admin)).toEqual({
      pencairanDue: 0,
      tagihanOverdue: 0,
      terlambatJobs: 0,
      keluhanOpen: 0,
      pastDeadline: 1,
    });
  });
});

describe("Antrean: no row from a failed Kode Masuk (ADR 0004)", () => {
  it("a Kode Masuk send failure creates no Antrean row: it is sent directly, never through a queue", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.email.failNextSend();

    const sent = await setup.identity.requestKodeMasuk({ email: "keluarga@contoh.id", ip: nextTestIp() });
    expect(sent).toEqual({ ok: false, reason: "gagal_kirim" });

    expect(await setup.queues.antrean(admin)).toHaveLength(0);
  });
});
