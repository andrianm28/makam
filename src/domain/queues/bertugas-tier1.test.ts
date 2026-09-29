/**
 * Bertugas, Tier 1 alerts and their escalation (spec, Work Queues and
 * Notifications; ticket 28; ADR 0004): who is Bertugas, when it switches off,
 * who a Tier 1 row alerts, the 30 and 90 minute escalations and the 06:00 rule for
 * a night TPU row. Driven through the module's public functions and its ticks with
 * the fake Clock; what an alert did is read back as the Peringatan Staf each Akun
 * Staf was logged as having received.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, adminPlatformOf, logIn } from "../../../tests/support/identity";
import { browserPushSubscription } from "../../../tests/support/notifications";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { queuesOnTestDatabase, type QueuesSetup } from "../../../tests/support/queues";
import { authenticatorCode } from "../../../tests/support/totp";
import { createQueuesTicks } from "./index";
import { antreanRowTypes } from "./index";
import { tier1RowTypes } from "./registry";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function ticksOf(setup: QueuesSetup, notifications: Parameters<typeof createQueuesTicks>[0]["notifications"] = setup.notifications) {
  const ticks = createQueuesTicks({
    db,
    clock: setup.clock,
    identity: setup.identity,
    notifications,
    pemesanan: setup.pemesanan,
    pengurusan: setup.pengurusan,
  });
  return {
    bertugasTick: ticks.bertugasTick,
    /** The Antrean's alert tick, then Notifications' send tick, as the worker runs them a minute apart. */
    async peringatanTick(now: Date) {
      const hasil = await ticks.peringatanTick(now);
      await setup.notifications.kirimPeringatanAntreanTick();
      return hasil;
    },
    /** The Antrean's alert tick alone: what is queued and not yet sent. */
    antrekanSaja: ticks.peringatanTick,
  };
}

/** The first Admin Platform, with one active Perangkat Push. */
async function adminDenganPush(setup: QueuesSetup): Promise<Actor> {
  const { actor } = await adminPlatformOf(setup);
  await setup.notifications.enablePush(actor, { subscription: browserPushSubscription() });
  return actor;
}

/** Another Admin Platform, invited by the first, past its own TOTP, optionally with a Perangkat Push. */
async function adminLain(setup: QueuesSetup, email: string, options: { push: boolean }): Promise<Actor> {
  const { actor: admin } = await adminPlatformOf(setup);
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "082222222222", role: "admin_platform" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  setup.clock.advance({ minutes: 1 });
  const { cookies } = await logIn(setup, email);
  const enrolment = await setup.identity.startTotpEnrolment(await actorOf(setup.identity, cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await setup.identity.passTotp(await actorOf(setup.identity, cookies), authenticatorCode(enrolment.secret, setup.clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  if (options.push) await setup.notifications.enablePush(actor, { subscription: browserPushSubscription() });
  return actor;
}

/** A declined Saat Duka order: a Tier 1 row that is not about a TPU. */
async function pesananDitolak(setup: QueuesSetup, pada?: string) {
  const fixture = await saatDukaFixture(setup);
  // The fixtures' logins moved the Clock; the row appears (and its alert clocks start) when the order is declined.
  if (pada) setup.clock.set(wib(pada));
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, alasan: "kapasitas_penuh" });
  if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
  return placed.pemesanan.nomor;
}

/** A Saat Duka TPU order awaiting confirmation: the Tier 1 "Konfirmasi TPU Saat Duka" row. */
async function pesananTpu(setup: QueuesSetup, pada?: string) {
  const fixture = await saatDukaTpuFixture(setup);
  // The row appears (and its alert clocks start) when the family submits the order.
  if (pada) setup.clock.set(wib(pada));
  const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  if (!placed.ok) throw new Error(`TPU order refused: ${placed.reason}`);
  return placed.pengurusan.nomor;
}

/** How many Peringatan Staf of one kind an Akun Staf was sent (by email; one per alert). */
async function jumlahPeringatan(setup: QueuesSetup, actor: Actor, kind: string): Promise<number> {
  const log = await setup.notifications.pesanStaf(actor.accountId, { limit: 100 });
  return log.filter((pesan) => pesan.template === kind && pesan.channel === "email").length;
}

describe("Bertugas", () => {
  it("is switched on only with an active Perangkat Push, and the Antrean header lists who is Bertugas now", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);

    expect(await setup.queues.aktifkanBertugas(admin)).toEqual({ ok: false, reason: "perlu_perangkat_push" });
    expect((await setup.queues.bertugas(admin))?.sekarang).toEqual([]);

    await setup.notifications.enablePush(admin, { subscription: browserPushSubscription() });
    const on = await setup.queues.aktifkanBertugas(admin);
    expect(on).toEqual({ ok: true, berakhirAt: wib("2026-10-01 18:00") });

    const status = await setup.queues.bertugas(admin);
    expect(status?.sekarang).toEqual([expect.objectContaining({ accountId: admin.accountId, name: "admin@makam.co.id", berakhirAt: wib("2026-10-01 18:00") })]);
    expect(status?.saya).toMatchObject({ bertugas: true, perangkatPush: 1 });
    expect(await setup.queues.aktifkanBertugas(admin)).toEqual({ ok: false, reason: "sudah_bertugas" });
  });

  it("is an Admin Platform's own switch: an Admin Lokasi cannot switch it on and does not see who is Bertugas", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    expect(await setup.queues.aktifkanBertugas(fixture.adminLokasi)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.queues.bertugas(fixture.adminLokasi)).toBeNull();
  });

  it("Bertugas switches itself off at 18:00 WIB, idempotently, leaving the Ambil claim and noting the event", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await adminDenganPush(setup);
    await pesananDitolak(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.queues.aktifkanBertugas(admin);
    const [row] = await setup.queues.antrean(admin);
    await setup.queues.ambilRow(admin, { type: row.type, subjectId: row.subjectId });
    const ticks = ticksOf(setup);

    expect(await ticks.bertugasTick(wib("2026-10-01 17:59"))).toEqual({ dimatikan: 0 });
    setup.clock.set(wib("2026-10-01 18:00"));
    expect(await ticks.bertugasTick(setup.clock.now())).toEqual({ dimatikan: 1 });
    expect(await ticks.bertugasTick(setup.clock.now())).toEqual({ dimatikan: 0 });

    const status = await setup.queues.bertugas(admin);
    expect(status?.sekarang).toEqual([]);
    expect(status?.saya).toMatchObject({ bertugas: false, dimatikanOtomatisAt: wib("2026-10-01 18:00") });
    expect((await setup.queues.antrean(admin))[0]?.ambil?.accountId).toBe(admin.accountId);
  });

  it("Bertugas switches itself off 12 h after it was switched on when that comes before 18:00 WIB", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await adminDenganPush(setup);
    const ticks = ticksOf(setup);

    // 05:00 + 12 h = 17:00, before 18:00.
    setup.clock.set(wib("2026-10-01 05:00"));
    expect(await setup.queues.aktifkanBertugas(admin)).toMatchObject({ ok: true, berakhirAt: wib("2026-10-01 17:00") });
    expect(await ticks.bertugasTick(wib("2026-10-01 16:59"))).toEqual({ dimatikan: 0 });
    expect(await ticks.bertugasTick(wib("2026-10-01 17:00"))).toEqual({ dimatikan: 1 });

    // 20:00 + 12 h = 08:00 the next morning, long before the next 18:00.
    setup.clock.set(wib("2026-10-01 20:00"));
    expect(await setup.queues.aktifkanBertugas(admin)).toMatchObject({ ok: true, berakhirAt: wib("2026-10-02 08:00") });
    expect(await ticks.bertugasTick(wib("2026-10-02 07:59"))).toEqual({ dimatikan: 0 });
    expect(await ticks.bertugasTick(wib("2026-10-02 08:00"))).toEqual({ dimatikan: 1 });
  });

  it("is no longer Bertugas the moment its time is up, even before the tick has run", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await adminDenganPush(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.queues.aktifkanBertugas(admin);

    setup.clock.set(wib("2026-10-01 18:05"));

    expect((await setup.queues.bertugas(admin))?.sekarang).toEqual([]);
    expect(await setup.queues.aktifkanBertugas(admin)).toMatchObject({ ok: true });
  });

  it("switching off by hand asks for every row held: released, or kept with a Catatan Internal for the hand-over", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await adminDenganPush(setup);
    await pesananDitolak(setup);
    await pesananTpu(setup);
    await setup.queues.aktifkanBertugas(admin);
    const rows = await setup.queues.antrean(admin);
    expect(rows.map((row) => row.type).sort()).toEqual(["konfirmasi_tpu_saat_duka", "saat_duka_ditolak"]);
    for (const row of rows) await setup.queues.ambilRow(admin, { type: row.type, subjectId: row.subjectId });
    const tpuRow = rows.find((row) => row.type === "konfirmasi_tpu_saat_duka")!;
    const ditolakRow = rows.find((row) => row.type === "saat_duka_ditolak")!;

    // Nothing said about either row: refused, and both are named.
    const tanpa = await setup.queues.matikanBertugas(admin, { penanganan: [] });
    expect(tanpa).toMatchObject({ ok: false, reason: "perlu_penanganan" });
    expect(tanpa.ok === false && tanpa.reason === "perlu_penanganan" && tanpa.baris.map((baris) => baris.type).sort()).toEqual([
      "konfirmasi_tpu_saat_duka",
      "saat_duka_ditolak",
    ]);
    // A Catatan Internal with no words is no hand-over.
    expect(
      await setup.queues.matikanBertugas(admin, {
        penanganan: [
          { type: tpuRow.type, subjectId: tpuRow.subjectId, aksi: "catatan", catatan: "" },
          { type: ditolakRow.type, subjectId: ditolakRow.subjectId, aksi: "lepas" },
        ],
      }),
    ).toMatchObject({ ok: false, reason: "perlu_penanganan" });
    expect((await setup.queues.bertugas(admin))?.saya.bertugas).toBe(true);

    const done = await setup.queues.matikanBertugas(admin, {
      penanganan: [
        { type: tpuRow.type, subjectId: tpuRow.subjectId, aksi: "catatan", catatan: "Sudah telepon TPU, tunggu balasan kepala TPU." },
        { type: ditolakRow.type, subjectId: ditolakRow.subjectId, aksi: "lepas" },
      ],
    });
    expect(done).toEqual({ ok: true, dilepas: 1, dicatat: 1 });

    const after = await setup.queues.antrean(admin);
    expect(after.find((row) => row.type === "saat_duka_ditolak")?.ambil).toBeNull();
    expect(after.find((row) => row.type === "konfirmasi_tpu_saat_duka")?.ambil?.accountId).toBe(admin.accountId);
    expect((await setup.queues.catatanInternal(admin, tpuRow.subjectKind, tpuRow.subjectId)).map((catatan) => catatan.body)).toEqual([
      "Sudah telepon TPU, tunggu balasan kepala TPU.",
    ]);
    expect((await setup.queues.bertugas(admin))?.saya.bertugas).toBe(false);
    expect(await setup.queues.matikanBertugas(admin, { penanganan: [] })).toEqual({ ok: false, reason: "tidak_bertugas" });

    // Every step is in the Audit Log: on, the release, the note, off.
    const actions = (await setup.audit.allEntries()).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["bertugas.aktifkan", "antrean.lepas", "catatan_internal.tulis", "bertugas.matikan"]));
  });
});

describe("Tier 1 alerts", () => {
  it("a new Tier 1 row alerts only the Bertugas Admin Platform", async () => {
    const setup = queuesOnTestDatabase(db);
    const bertugas = await adminDenganPush(setup);
    const lain = await adminLain(setup, "admin.dua@makam.co.id", { push: true });
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.queues.aktifkanBertugas(bertugas);
    await pesananDitolak(setup, "2026-10-01 09:00");

    const result = await ticksOf(setup).peringatanTick(setup.clock.now());

    expect(result).toEqual({ diantrekan: 1 });
    expect(await jumlahPeringatan(setup, bertugas, "staf_antrean_mendesak")).toBe(1);
    expect(await jumlahPeringatan(setup, lain, "staf_antrean_mendesak")).toBe(0);
    // By web push as well as email, and the push names the kind of row, never who it is about.
    const push = setup.webPush.sent.filter((sent) => sent.notification.title.startsWith("Antrean mendesak"));
    expect(push).toHaveLength(1);
    expect(push[0]?.notification.body).not.toContain("Siti Aminah");
    expect(push[0]?.notification.url).toBe("/staf/admin-platform/antrean");
  });

  it("with nobody Bertugas a new Tier 1 row alerts every Admin Platform", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananDitolak(setup, "2026-10-01 09:00");
    const dua = await adminLain(setup, "admin.dua@makam.co.id", { push: true });

    await ticksOf(setup).peringatanTick(setup.clock.now());

    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
    expect(await jumlahPeringatan(setup, dua, "staf_antrean_mendesak")).toBe(1);
  });

  it("a Tier 1 row not taken within 30 min alerts every Admin Platform; one that is taken does not", async () => {
    const setup = queuesOnTestDatabase(db);
    const bertugas = await adminDenganPush(setup);
    const lain = await adminLain(setup, "admin.dua@makam.co.id", { push: true });
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.queues.aktifkanBertugas(bertugas);
    await pesananDitolak(setup, "2026-10-01 09:00");
    await pesananTpu(setup, "2026-10-01 09:00");
    const ticks = ticksOf(setup);
    await ticks.peringatanTick(setup.clock.now());
    const [rowDitolak] = (await setup.queues.antrean(bertugas)).filter((row) => row.type === "saat_duka_ditolak");
    await setup.queues.ambilRow(bertugas, { type: rowDitolak.type, subjectId: rowDitolak.subjectId });

    setup.clock.set(wib("2026-10-01 09:29"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, lain, "staf_antrean_eskalasi")).toBe(0);

    setup.clock.set(wib("2026-10-01 09:30"));
    await ticks.peringatanTick(setup.clock.now());
    // Only the TPU row, which nobody took, escalated; the declined order was taken.
    expect(await jumlahPeringatan(setup, lain, "staf_antrean_eskalasi")).toBe(1);
    expect(await jumlahPeringatan(setup, bertugas, "staf_antrean_eskalasi")).toBe(1);
  });

  it("a Konfirmasi TPU Saat Duka still unconfirmed at 90 min alerts everyone again, even once taken", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananTpu(setup, "2026-10-01 09:00");
    const dua = await adminLain(setup, "admin.dua@makam.co.id", { push: true });
    const ticks = ticksOf(setup);
    await ticks.peringatanTick(setup.clock.now());
    const [row] = await setup.queues.antrean(satu);
    await setup.queues.ambilRow(satu, { type: row.type, subjectId: row.subjectId });

    // Taken: no 30 min escalation.
    setup.clock.set(wib("2026-10-01 09:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, dua, "staf_antrean_eskalasi")).toBe(0);

    setup.clock.set(wib("2026-10-01 10:29"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, dua, "staf_antrean_eskalasi")).toBe(0);

    setup.clock.set(wib("2026-10-01 10:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, dua, "staf_antrean_eskalasi")).toBe(1);
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);
  });

  it("a declined order has no 90 min alert: only a Konfirmasi TPU Saat Duka does", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananDitolak(setup, "2026-10-01 09:00");
    const ticks = ticksOf(setup);
    await ticks.peringatanTick(setup.clock.now());

    // One escalation at 30 min (nobody took it), none at 90.
    setup.clock.set(wib("2026-10-01 09:30"));
    await ticks.peringatanTick(setup.clock.now());
    setup.clock.set(wib("2026-10-01 10:30"));
    await ticks.peringatanTick(setup.clock.now());

    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);
  });

  it("a Konfirmasi TPU Saat Duka opened at night alerts at 06:00 WIB, and its clocks run from that alert", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 23:30"));
    const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    if (!placed.ok) throw new Error(`TPU order refused: ${placed.reason}`);
    const ticks = ticksOf(setup);

    await ticks.peringatanTick(setup.clock.now());
    setup.clock.set(wib("2026-10-02 03:00"));
    await ticks.peringatanTick(setup.clock.now());
    setup.clock.set(wib("2026-10-02 05:59"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(0);

    setup.clock.set(wib("2026-10-02 06:00"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);

    // The 30 min escalation counts from the 06:00 alert, not from the night it opened.
    setup.clock.set(wib("2026-10-02 06:29"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(0);
    setup.clock.set(wib("2026-10-02 06:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);
  });

  it("a Konfirmasi TPU Saat Duka opened within 06:00–18:00 alerts at once", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 17:59"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    await ticksOf(setup).peringatanTick(setup.clock.now());

    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
  });

  it("running the alert tick twice for the same moment alerts once; the row closing forgets it", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    const nomor = await pesananTpu(setup, "2026-10-01 09:00");
    const ticks = ticksOf(setup);

    await ticks.peringatanTick(setup.clock.now());
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });
    setup.clock.set(wib("2026-10-01 09:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });
    setup.clock.set(wib("2026-10-01 10:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });

    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(2);
    expect(nomor).toBeTruthy();
  });

  it("a late first tick still escalates on time: the clocks count from when the order was submitted, not from the tick's first sight", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananTpu(setup, "2026-10-01 09:00");
    const ticks = ticksOf(setup);

    // The worker was down: the first tick comes 40 min after the submission. The first alert and the
    // 30 min escalation are queued together (first alert first); the 90 min one is not due yet.
    setup.clock.set(wib("2026-10-01 09:40"));
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 2 });
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);

    setup.clock.set(wib("2026-10-01 10:29"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);
    setup.clock.set(wib("2026-10-01 10:30"));
    await ticks.peringatanTick(setup.clock.now());
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(2);
  });

  it("a declined order's clocks count from the decline", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananDitolak(setup, "2026-10-01 09:00");

    setup.clock.set(wib("2026-10-01 09:31"));
    await ticksOf(setup).peringatanTick(setup.clock.now());

    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_eskalasi")).toBe(1);
  });

  it("an alert is queued together with its claim: a failure while queuing loses no stage, and a crash before the send loses no alert", async () => {
    const setup = queuesOnTestDatabase(db);
    const satu = await adminDenganPush(setup);
    await pesananTpu(setup, "2026-10-01 09:00");

    // Queuing fails: the stage claim rolls back with it, so the next tick still alerts.
    const rusak = ticksOf(setup, {
      ...setup.notifications,
      peringatanAntreanTier1: async () => {
        throw new Error("antrean gagal");
      },
    });
    await expect(rusak.peringatanTick(setup.clock.now())).rejects.toThrow("antrean gagal");
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(0);

    // Queued, then the process dies before Notifications' tick sends: nothing is delivered yet ...
    const ticks = ticksOf(setup);
    expect(await ticks.antrekanSaja(setup.clock.now())).toEqual({ diantrekan: 1 });
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(0);
    // ... and a tick run again does not queue it twice ...
    expect(await ticks.antrekanSaja(setup.clock.now())).toEqual({ diantrekan: 0 });
    // ... and the send tick that comes later delivers it, once.
    expect(await setup.notifications.kirimPeringatanAntreanTick()).toEqual({ dikirim: 1 });
    expect(await setup.notifications.kirimPeringatanAntreanTick()).toEqual({ dikirim: 0 });
    expect(await jumlahPeringatan(setup, satu, "staf_antrean_mendesak")).toBe(1);
  });

  it("Tier 2 rows show in the Antrean without an alert, and Tier 3 and 4 never alert", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    await setup.notifications.enablePush(admin, { subscription: browserPushSubscription() });
    const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
    if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
    const payment = await setup.payments.createPayment({ reference: "referensi-tak-dikenal", amountRupiah: 500_000, description: "Pembayaran QRIS" });
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    const rows = await setup.queues.antrean(admin);
    expect(rows).toEqual([expect.objectContaining({ type: "pembayaran_perlu_ditinjau", tier: 2, alerts: false })]);

    setup.clock.advance({ hours: 3 });
    const ticks = ticksOf(setup);
    await ticks.peringatanTick(setup.clock.now());
    setup.clock.advance({ hours: 3 });
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });
    expect(await jumlahPeringatan(setup, admin, "staf_antrean_mendesak")).toBe(0);
    expect(await jumlahPeringatan(setup, admin, "staf_antrean_eskalasi")).toBe(0);
  });

  it("only Tier 1 row types are alerted on: the registry's Tier 1 types are exactly the alert list", () => {
    const tier1DiRegistry = antreanRowTypes.filter((type) => type.tier === 1).map((type) => type.key).sort();
    expect(tier1RowTypes.map((type) => type.key).sort()).toEqual(tier1DiRegistry);
  });
});

describe("the red banner: Tier 1 rows nobody has taken", () => {
  it("counts the untaken Tier 1 rows for an Admin Platform and drops a row the moment it is taken", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await adminDenganPush(setup);
    const lain = await adminLain(setup, "admin.dua@makam.co.id", { push: false });
    expect(await setup.queues.tier1BelumDiambil(admin)).toBe(0);

    await pesananDitolak(setup);
    await pesananTpu(setup);
    // Every Admin Platform sees it, whoever is Bertugas.
    expect(await setup.queues.tier1BelumDiambil(admin)).toBe(2);
    expect(await setup.queues.tier1BelumDiambil(lain)).toBe(2);

    const [row] = await setup.queues.antrean(admin);
    await setup.queues.ambilRow(lain, { type: row.type, subjectId: row.subjectId });
    expect(await setup.queues.tier1BelumDiambil(admin)).toBe(1);
  });

  it("is nothing for anyone but an Admin Platform", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, alasan: "kapasitas_penuh" });

    expect(await setup.queues.tier1BelumDiambil(fixture.adminLokasi)).toBe(0);
  });
});
