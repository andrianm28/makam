/**
 * Bertugas (CONTEXT.md; spec, Work Queues: "switching it on needs at least one
 * active Perangkat Push"; the 18:00 / 12 h auto-off; "Going off duty asks the
 * staff member to release or annotate their Ambil claims"; ticket 28).
 *
 * Driven through the module's own public functions: nobody reads a table here,
 * and the only trace of an automatic hand-over is the Catatan Internal thread the
 * Antrean page shows.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { actorOf, logIn } from "../../../tests/support/identity";
import { browserPushSubscription } from "../../../tests/support/notifications";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import {
  queuesOnTestDatabase,
  signedInAdminLokasi,
  signedInAdminPlatform,
  type QueuesSetup,
} from "../../../tests/support/queues";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { authenticatorCode } from "../../../tests/support/totp";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** An Admin Platform with one active Perangkat Push, which Bertugas requires (ADR 0004). */
async function adminDenganPush(setup: QueuesSetup, actor: Actor) {
  const aktif = await setup.notifications.enablePush(actor, {
    subscription: browserPushSubscription(),
  });
  if (!aktif.ok) throw new Error(`push refused: ${aktif.reason}`);
  return actor;
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

/** One declined Saat Duka order, so the Antrean has a Tier 1 row to hold and to alert about. */
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
  return { ...fixture, row };
}

describe("Bertugas: who is on duty for the Antrean's Tier 1 alerts", () => {
  it("is refused without an active Perangkat Push, and listed at the top of the Antrean once there is one", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    expect(await setup.queues.petugasBertugas(admin)).toEqual([]);

    // ADR 0004: a Peringatan Staf only reaches a browser that asked for it, so a
    // duty nobody's device would ring is refused rather than silently useless.
    expect(await setup.queues.nyalakanBertugas(admin)).toEqual({
      ok: false,
      reason: "perangkat_push_kosong",
    });
    expect(await setup.queues.petugasBertugas(admin)).toEqual([]);

    await adminDenganPush(setup, admin);
    expect(await setup.queues.nyalakanBertugas(admin)).toEqual({ ok: true });
    expect(await setup.queues.petugasBertugas(admin)).toEqual([
      {
        accountId: admin.accountId,
        sejak: setup.clock.now(),
        berakhirPada: wib("2026-10-01 18:00"),
      },
    ]);
  });

  it("is not an identity: another person on duty does not change who this Akun is", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    const kedua = await adminPlatformKedua(setup, admin);
    await adminDenganPush(setup, kedua);
    await setup.queues.nyalakanBertugas(kedua);

    // Two duties, two Akun Staf, and the Akun each of them already had: switching
    // on creates no account, grants no role and starts no session.
    const onDuty = (await setup.queues.petugasBertugas(admin)).map((satu) => satu.accountId);
    expect([...onDuty].sort()).toEqual([admin.accountId, kedua.accountId].sort());
    const staff = await setup.identity.staffAccounts();
    for (const akun of staff.filter((satu) => satu.roles.includes("admin_platform"))) {
      expect(akun.roles).toEqual(["admin_platform"]);
    }
  });

  it("ends by itself at 18:00 WIB, and the tick is idempotent", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 08:00"));
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    expect((await setup.queues.petugasBertugas(admin))[0]?.berakhirPada).toEqual(wib("2026-10-01 18:00"));

    setup.clock.set(wib("2026-10-01 17:59"));
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [],
    });
    expect(await setup.queues.petugasBertugas(admin)).toHaveLength(1);

    setup.clock.set(wib("2026-10-01 18:00"));
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [{ accountId: admin.accountId, klaim: [] }],
    });
    expect(await setup.queues.petugasBertugas(admin)).toEqual([]);

    // Run it again at the same instant: the duty is already off, and nothing happens twice.
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [],
    });
  });

  it("ends by itself after 12 h when a duty is switched on after 18:00", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 19:00"));
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    // 12 h is 07:00 tomorrow; the next 18:00 is later, so the 12 h cap wins.
    expect((await setup.queues.petugasBertugas(admin))[0]?.berakhirPada).toEqual(wib("2026-10-02 07:00"));

    setup.clock.set(wib("2026-10-02 06:59"));
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [],
    });

    setup.clock.set(wib("2026-10-02 07:00"));
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [{ accountId: admin.accountId, klaim: [] }],
    });
    expect(await setup.queues.petugasBertugas(admin)).toEqual([]);
  });

  it("coming off duty by hand releases a claim, or hands it over in a Catatan Internal", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    const { admin } = ditolak;
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    await setup.queues.ambilRow(admin, {
      type: ditolak.row.type,
      subjectId: ditolak.row.subjectId,
      subjectKind: ditolak.row.subjectKind,
    });

    // Nobody may come off duty with a claim nobody answered: that would drop work in silence.
    expect(await setup.queues.matikanBertugas(admin, { klaim: [] })).toEqual({
      ok: false,
      reason: "klaim_belum_diputuskan",
    });
    expect((await setup.queues.petugasBertugas(admin)).map((satu) => satu.accountId)).toEqual([admin.accountId]);

    const turun = await setup.queues.matikanBertugas(admin, {
      klaim: [
        {
          type: ditolak.row.type,
          subjectId: ditolak.row.subjectId,
          lepas: false,
          catatan: "Sudah menelepon Lokasi Mitra, menunggu jawaban.",
        },
      ],
    });
    expect(turun).toMatchObject({
      ok: true,
      dicatat: [`${ditolak.row.type}:${ditolak.row.subjectId}`],
    });
    expect(await setup.queues.petugasBertugas(admin)).toEqual([]);
    // The claim is kept — the work is this person's until somebody takes it — and
    // the hand-over says where it stands.
    const [row] = (await setup.queues.antrean(admin)).filter((satu) => satu.type === ditolak.row.type);
    expect(row?.ambil?.accountId).toBe(admin.accountId);
    expect(await setup.queues.catatanInternal(admin, ditolak.row.subjectKind, ditolak.row.subjectId)).toEqual([
      expect.objectContaining({
        body: "Sudah menelepon Lokasi Mitra, menunggu jawaban.",
        olehPlatform: false,
      }),
    ]);
  });

  it("coming off duty by hand releases a claim the person says is no longer theirs", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    const { admin } = ditolak;
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    await setup.queues.ambilRow(admin, {
      type: ditolak.row.type,
      subjectId: ditolak.row.subjectId,
      subjectKind: ditolak.row.subjectKind,
    });

    const turun = await setup.queues.matikanBertugas(admin, {
      klaim: [
        {
          type: ditolak.row.type,
          subjectId: ditolak.row.subjectId,
          lepas: true,
          catatan: null,
        },
      ],
    });
    expect(turun).toMatchObject({
      ok: true,
      dilepas: [`${ditolak.row.type}:${ditolak.row.subjectId}`],
    });
    const [row] = (await setup.queues.antrean(admin)).filter((satu) => satu.type === ditolak.row.type);
    expect(row?.ambil).toBeNull();
  });

  it("the auto-off leaves the claims alone and notes the event on each of them", async () => {
    const setup = queuesOnTestDatabase(db);
    setup.clock.set(wib("2026-10-01 08:00"));
    const ditolak = await ditolakTier1(setup, "2026-10-01 08:30");
    const { admin } = ditolak;
    await adminDenganPush(setup, admin);
    await setup.queues.nyalakanBertugas(admin);
    await setup.queues.ambilRow(admin, {
      type: ditolak.row.type,
      subjectId: ditolak.row.subjectId,
      subjectKind: ditolak.row.subjectKind,
    });

    setup.clock.set(wib("2026-10-01 18:00"));
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [
        {
          accountId: admin.accountId,
          klaim: [`${ditolak.row.type}:${ditolak.row.subjectId}`],
        },
      ],
    });

    // Nobody chose to hand this over, so the claim stands and the event is written down.
    const [row] = (await setup.queues.antrean(admin)).filter((satu) => satu.type === ditolak.row.type);
    expect(row?.ambil?.accountId).toBe(admin.accountId);
    const catatan = await setup.queues.catatanInternal(admin, ditolak.row.subjectKind, ditolak.row.subjectId);
    expect(catatan).toHaveLength(1);
    expect(catatan[0]).toMatchObject({ olehPlatform: true });
    expect(catatan[0]?.body).toContain("Bertugas berakhir otomatis");

    // Idempotent: a second run at the same instant writes no second note.
    expect(await setup.queues.tickBertugas(setup.clock.now())).toEqual({
      dimatikan: [],
    });
    expect(await setup.queues.catatanInternal(admin, ditolak.row.subjectKind, ditolak.row.subjectId)).toHaveLength(1);
  });

  it("only an Admin Platform may be Bertugas", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    const adminLokasi = await signedInAdminLokasi(setup, ditolak.admin, [ditolak.lokasiMitra.id]);
    expect(await setup.queues.nyalakanBertugas(adminLokasi)).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.queues.petugasBertugas(adminLokasi)).toEqual([]);
  });
});
