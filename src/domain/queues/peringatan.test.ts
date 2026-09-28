/**
 * The Antrean's Tier 1 Peringatan Staf and their escalations (spec, Work
 * Queues: "A new Tier 1 row alerts the Bertugas Admin Platform (all Admin
 * Platform if none is Bertugas)"; "If not taken (Ambil) within 30 min, every
 * Admin Platform is alerted"; "Night TPU rows alert at 06:00"; "Tier 2 rows
 * show in the Antrean without alerts; Tier 3–4 never alert"; ticket 28).
 *
 * Every assertion is on what left the module: the emails the fake sender
 * recorded, what the Antrean says afterwards, and the alerts the tick reports.
 * Nobody reads `antrean_peringatan` and no test calls a private helper. The one
 * rule whose subject does not exist yet — the 06:00 hold for a DKI TPU row,
 * which ticket 45's Konfirmasi TPU Saat Duka is the first to declare — is pinned
 * through the published rule that row type will use.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diumumkanPada, tahapPeringatan, type PeringatanAntrean } from "@/domain/queues";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { browserPushSubscription } from "../../../tests/support/notifications";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import {
  publishedLokasiMitra,
  queuesOnTestDatabase,
  signedInAdminPlatform,
  type QueuesSetup,
} from "../../../tests/support/queues";
import { authenticatorCode } from "../../../tests/support/totp";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Every Antrean Peringatan Staf the fake EmailSender recorded, oldest first. */
function peringatanAntrean(setup: QueuesSetup) {
  return setup.email.sent.filter((message) => message.subject.startsWith("Antrean Tier 1"));
}

/** A second Admin Platform: invited by `admin`, logged in and past its own TOTP. */
async function adminPlatformKedua(setup: QueuesSetup, admin: Actor, email = "admin.dua@makam.co.id"): Promise<Actor> {
  const invitations = await setup.identity.inviteStaff(admin, {
    email,
    phoneNumber: "082222222222",
    role: "admin_platform",
  });
  if (!invitations.ok) throw new Error(`invite refused: ${invitations.reason}`);
  const { cookies } = await logIn(setup, email);
  const enrolment = await setup.identity.startTotpEnrolment(await actorOf(setup.identity, cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const lewat = await setup.identity.passTotp(
    await actorOf(setup.identity, cookies),
    authenticatorCode(enrolment.secret, setup.clock.now()),
  );
  if (!lewat.ok) throw new Error(`TOTP refused: ${lewat.reason}`);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** One declined Saat Duka order: the Antrean's Tier 1 call row, open from the decline. */
async function ditolakTier1(setup: QueuesSetup, pada: string) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  setup.clock.set(wib(pada));
  const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    alasan: "kapasitas_penuh",
  });
  if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
  const [row] = (await setup.queues.antrean(fixture.admin)).filter((satu) => satu.type === "saat_duka_ditolak");
  if (!row) throw new Error("no Tier 1 row for the declined order");
  return { ...fixture, row, rowKey: `${row.type}:${row.subjectId}` };
}

describe("Peringatan Staf Tier 1 Antrean", () => {
  it("a new Tier 1 row goes to whoever is Bertugas, and to every Admin Platform when nobody is", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    await adminPlatformKedua(setup, ditolak.admin);

    // Nobody on duty: both Admin Platform hear about it.
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [{ rowKey: ditolak.rowKey, tahap: 0, penerima: 2 }],
    });
    expect(peringatanAntrean(setup).map((message) => message.to)).toEqual([
      "admin@makam.co.id",
      "admin.dua@makam.co.id",
    ]);

    // A second run at the same instant sends nothing the first did not.
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [],
    });
    expect(peringatanAntrean(setup)).toHaveLength(2);
  });

  it("with somebody on duty, only they are told about the new row", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    const kedua = await adminPlatformKedua(setup, ditolak.admin);
    const push = await setup.notifications.enablePush(ditolak.admin, {
      subscription: browserPushSubscription(),
    });
    if (!push.ok) throw new Error(`push refused: ${push.reason}`);
    expect(await setup.queues.nyalakanBertugas(ditolak.admin)).toEqual({
      ok: true,
    });
    expect(kedua.accountId).not.toBe(ditolak.admin.accountId);

    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [{ rowKey: ditolak.rowKey, tahap: 0, penerima: 1 }],
    });
    expect(peringatanAntrean(setup).map((message) => message.to)).toEqual(["admin@makam.co.id"]);
  });

  it("a Tier 1 row nobody takes within 30 min re-alerts every Admin Platform, once", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    await adminPlatformKedua(setup, ditolak.admin);
    await setup.queues.tickPeringatan(setup.clock.now());
    expect(peringatanAntrean(setup)).toHaveLength(2);

    // 29 minutes: nothing new, whatever the minute.
    setup.clock.set(wib("2026-10-01 11:59"));
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [],
    });

    setup.clock.set(wib("2026-10-01 12:00"));
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [{ rowKey: ditolak.rowKey, tahap: 30, penerima: 2 }],
    });
    expect(
      peringatanAntrean(setup)
        .filter((message) => message.subject.includes("belum diambil"))
        .map((m) => m.to),
    ).toEqual(["admin@makam.co.id", "admin.dua@makam.co.id"]);

    // Idempotent: a later run re-alerts nobody a second time.
    setup.clock.set(wib("2026-10-01 12:30"));
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [],
    });
    expect(peringatanAntrean(setup)).toHaveLength(4);
  });

  it("a Tier 1 row taken (Ambil) before 30 minutes is never re-alerted", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    await adminPlatformKedua(setup, ditolak.admin);
    await setup.queues.tickPeringatan(setup.clock.now());
    const diambil = await setup.queues.ambilRow(ditolak.admin, {
      type: ditolak.row.type,
      subjectId: ditolak.row.subjectId,
      subjectKind: ditolak.row.subjectKind,
    });
    expect(diambil.ok).toBe(true);

    setup.clock.set(wib("2026-10-01 12:30"));
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [],
    });
    expect(peringatanAntrean(setup)).toHaveLength(2);
  });

  it("a Tier 1 TPU row is announced at 06:00 when it appears at night, and its 30 min waits for that", () => {
    // What a DKI TPU row type declares (ticket 45's Konfirmasi TPU Saat Duka is the
    // first): a submission nobody can act on at 02:00 is announced when the
    // 06:00–18:00 window opens, not in the middle of the night.
    const tpu: PeringatanAntrean = { tpu: true, eskalasiMenit: [30, 90] };
    expect(saatDiumumkan(tpu, wib("2026-10-01 02:00"))).toEqual(wib("2026-10-01 06:00"));
    expect(saatDiumumkan(tpu, wib("2026-10-01 19:00"))).toEqual(wib("2026-10-02 06:00"));
    // Inside the window it is announced at once, and never held to 08:00: a
    // Peringatan Staf is transaksional, so the 08:00–20:00 message window — which
    // is a delivery window for family reminders — is no part of this.
    expect(saatDiumumkan(tpu, wib("2026-10-01 09:15"))).toEqual(wib("2026-10-01 09:15"));
    expect(saatDiumumkan(tpu, wib("2026-10-01 17:59"))).toEqual(wib("2026-10-01 17:59"));
    // A Lokasi Mitra row is announced whenever it appears, at any hour.
    expect(saatDiumumkan({ tpu: false, eskalasiMenit: [30] }, wib("2026-10-01 02:00"))).toEqual(
      wib("2026-10-01 02:00"),
    );
  });

  it("a Konfirmasi TPU Saat Duka row created at 02:00 owes three alerts: 06:00, and 30 and 90 minutes after that", () => {
    // The pair ticket 45's row type declares. The instant the first alert went out
    // is the start of the escalation clock, so a night row is 06:00, 06:30 and
    // 07:30 — never 02:00, 02:30 and 03:30, which would escalate about a duty
    // nobody had been told of.
    expect(tahapPeringatan({ tpu: true, eskalasiMenit: [30, 90] }, wib("2026-10-01 02:00"))).toEqual([
      { tahap: 0, jatuhPada: wib("2026-10-01 06:00") },
      { tahap: 30, jatuhPada: wib("2026-10-01 06:30") },
      { tahap: 90, jatuhPada: wib("2026-10-01 07:30") },
    ]);
    // In the daytime the row's own alert is at once, and the escalations follow it.
    expect(tahapPeringatan({ tpu: true, eskalasiMenit: [30, 90] }, wib("2026-10-01 11:00"))).toEqual([
      { tahap: 0, jatuhPada: wib("2026-10-01 11:00") },
      { tahap: 30, jatuhPada: wib("2026-10-01 11:30") },
      { tahap: 90, jatuhPada: wib("2026-10-01 12:30") },
    ]);
  });

  it("a Tier 2 row shows in the Antrean without alerting anybody", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    // A payment the provider reported that no Tagihan can be tied to: the Antrean's
    // own Tier 2 "Pembayaran perlu ditinjau" row.
    const pengaturan = await setup.operatorSettings.change(ditolak.admin, {
      ...PENGATURAN_OPERATOR,
      reason: null,
    });
    if (!pengaturan.ok) throw new Error(`Pengaturan Operator refused: ${pengaturan.reason}`);
    const payment = await setup.payments.createPayment({
      reference: "referensi-tak-dikenal",
      amountRupiah: 500_000,
      description: "Pembayaran QRIS",
    });
    const diterima = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid"),
    );
    if (diterima.ok !== true) throw new Error("unreachable");

    const baris = await setup.queues.antrean(ditolak.admin);
    const tier2 = baris.filter((satu) => satu.type === "pembayaran_perlu_ditinjau");
    expect(tier2).toHaveLength(1);
    expect(tier2[0]?.alerts).toBe(false);

    // Only the Tier 1 row is announced: the Tier 2 one is in the list and silent.
    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [{ rowKey: ditolak.rowKey, tahap: 0, penerima: 1 }],
    });
    expect(peringatanAntrean(setup).map((message) => message.to)).toEqual(["admin@makam.co.id"]);
  });

  it("a Tier 4 row shows in the Antrean without alerting anybody", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, petugas } = await publishedLokasiMitra(setup, admin);
    // A Kunjungan Verifikasi still assigned after its planned day: the Antrean's own
    // Tier 4 "Lokasi kunjungan ulang" row.
    const tugas = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: "Kunjungan Verifikasi",
      lokasiId: lokasiMitra.id,
      address: "Jl. Raya Pondok Rangon No. 1",
      pin: { lat: -6.29, lng: 106.9 },
      plannedDate: "2026-09-01",
      assigneeAccountId: petugas.accountId,
    });
    if (!tugas.ok) throw new Error(`tugas refused: ${tugas.reason}`);

    const tier4 = (await setup.queues.antrean(admin)).filter((satu) => satu.tier === 4);
    expect(tier4.map((satu) => satu.type)).toContain("lokasi_kunjungan_ulang");
    expect(tier4.every((satu) => satu.alerts === false)).toBe(true);

    expect(await setup.queues.tickPeringatan(setup.clock.now())).toEqual({
      dikirim: [],
    });
    expect(peringatanAntrean(setup)).toEqual([]);
  });

  it("no unanswered Tier 1 alert opens a call row (decided 2026-09-26)", async () => {
    const setup = queuesOnTestDatabase(db);
    await ditolakTier1(setup, "2026-10-01 11:30");
    const sebelum = await setup.notifications.teleponPemesanTerbuka();

    setup.clock.set(wib("2026-10-01 12:30"));
    await setup.queues.tickPeringatan(setup.clock.now());

    // The one call row is the declined order's own (ticket 24), unchanged by the
    // alert: nobody is called, because the platform cannot place a call.
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual(sebelum);
  });
});

/** The module's published announcement rule, named for the test that reads it. */
function saatDiumumkan(peringatan: PeringatanAntrean, dibukaPada: Date): Date {
  return diumumkanPada(peringatan, dibukaPada);
}
