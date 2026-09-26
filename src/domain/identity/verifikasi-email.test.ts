import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmailSender } from "@/adapters/memory";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  actorOf,
  emailCodeTo,
  identityOnTestDatabase,
  logIn,
  nextTestIp,
  signedInAdminPlatform,
  type IdentitySetup,
} from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The Lokasi Mitra an Admin Lokasi invite names (the identity module keeps the id as given). */
const LOKASI = "5d1f4c2e-0000-4000-8000-000000000001";

/** The Akun's Email Terverifikasi, read afresh from its session. */
async function emailOf(setup: IdentitySetup, cookies: string) {
  return (await actorOf(setup.identity, cookies)).email;
}

describe("Verifikasi Email in the Akun Saya profile", () => {
  it("a code goes to the new email, and entering it makes that email the Akun's Email Terverifikasi, its key", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    const { login, cookies } = await logIn(setup, "lama@contoh.id");
    const pemesan = await actorOf(identity, cookies);

    const sent = await identity.requestEmailVerification(pemesan, { email: " Baru@Contoh.id ", ip: nextTestIp() });

    expect(sent).toMatchObject({ ok: true, email: "baru@contoh.id" });
    expect(await emailOf(setup, cookies)).toBe("lama@contoh.id");

    const confirmed = await identity.confirmEmailVerification(pemesan, { code: emailCodeTo(email, "baru@contoh.id") });

    expect(confirmed).toEqual({ ok: true, email: "baru@contoh.id" });
    expect(await emailOf(setup, cookies)).toBe("baru@contoh.id");
    expect(await identity.accountByEmail("baru@contoh.id")).toMatchObject({ id: login.account.id });
    expect(await identity.accountByEmail("lama@contoh.id")).toBeNull();
  });

  it("the old Email Terverifikasi stays in force until the new code is entered; afterwards a Kode Masuk to it makes a new Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    const { login, cookies } = await logIn(setup, "lama@contoh.id");
    const actor = await actorOf(identity, cookies);

    await identity.requestEmailVerification(actor, { email: "baru@contoh.id", ip: nextTestIp() });
    const newCode = emailCodeTo(email, "baru@contoh.id");
    clock.advance({ minutes: 1 });
    expect((await logIn(setup, "lama@contoh.id")).login.account.id).toBe(login.account.id);

    await identity.confirmEmailVerification(actor, { code: newCode });
    clock.advance({ minutes: 1 });

    expect((await logIn(setup, "baru@contoh.id")).login).toMatchObject({ accountCreated: false, account: { id: login.account.id } });
    expect((await logIn(setup, "lama@contoh.id")).login).toMatchObject({ accountCreated: true });
  });
});

describe("Verifikasi Email rules", () => {
  it("Verifikasi email refuses an email that is another Akun's key, and nothing changes", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    const sari = await logIn(setup, "sari@contoh.id");
    const budi = await logIn(setup, "budi@contoh.id");
    const budiActor = await actorOf(identity, budi.cookies);
    setup.clock.advance({ minutes: 1 });

    await identity.requestEmailVerification(budiActor, { email: "sari@contoh.id", ip: nextTestIp() });
    const refused = await identity.confirmEmailVerification(budiActor, { code: emailCodeTo(email, "sari@contoh.id") });

    expect(refused).toEqual({ ok: false, reason: "email_sudah_dipakai" });
    expect(await emailOf(setup, budi.cookies)).toBe("budi@contoh.id");
    expect(await identity.accountByEmail("sari@contoh.id")).toMatchObject({ id: sari.login.account.id });
  });

  it("two Akun verifying the same email at once: one gets it, the other is refused (email_sudah_dipakai) by the database", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    const first = await actorOf(identity, (await logIn(setup, "a@contoh.id")).cookies);
    const second = await actorOf(identity, (await logIn(setup, "b@contoh.id")).cookies);
    await identity.requestEmailVerification(first, { email: "sari@contoh.id", ip: nextTestIp() });
    const firstCode = emailCodeTo(email, "sari@contoh.id");
    clock.advance({ minutes: 1 });
    await identity.requestEmailVerification(second, { email: "SARI@contoh.id", ip: nextTestIp() });
    const secondCode = emailCodeTo(email, "sari@contoh.id");

    const results = await Promise.all([
      identity.confirmEmailVerification(first, { code: firstCode }),
      identity.confirmEmailVerification(second, { code: secondCode }),
    ]);

    expect(results).toContainEqual({ ok: true, email: "sari@contoh.id" });
    expect(results).toContainEqual({ ok: false, reason: "email_sudah_dipakai" });
    expect([first.accountId, second.accountId]).toContain((await identity.accountByEmail("sari@contoh.id"))?.id);
  });
});

describe("when the EmailSender refuses a Verifikasi Email code", () => {
  it("the Akun is told gagal kirim, reported without the address, and a retry at once from the same IP goes out", async () => {
    const fake = new FakeEmailSender();
    const reported: string[] = [];
    const setup = identityOnTestDatabase(db, { email: fake, reportError: (event, error) => reported.push(`${event} ${String(error)}`) });
    const actor = await actorOf(setup.identity, (await logIn(setup, "sari@contoh.id")).cookies);
    const ip = nextTestIp();
    fake.failNextSend();

    expect(await setup.identity.requestEmailVerification(actor, { email: "baru@contoh.id", ip })).toEqual({
      ok: false,
      reason: "gagal_kirim",
    });
    expect(reported).toHaveLength(1);
    expect(reported[0]).not.toContain("baru@contoh.id");
    expect(await setup.identity.requestEmailVerification(actor, { email: "baru@contoh.id", ip })).toMatchObject({ ok: true });
  });
});

describe("Verifikasi Email in the staff area", () => {
  it("is a staff write: it records an Entri Audit (akun.email_verifikasi) without the code; a Pemesan's records none", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, audit, email, clock } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    await identity.inviteStaff(admin, { email: "staf@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    const staff = await logIn(setup, "staf@contoh.id");
    const staffActor = await actorOf(identity, staff.cookies);
    await identity.requestEmailVerification(staffActor, { email: "baru@contoh.id", ip: nextTestIp() });
    const code = emailCodeTo(email, "baru@contoh.id");
    const verifiedAt = clock.now();

    await identity.confirmEmailVerification(staffActor, { code });

    const entries = await audit.entriesAbout({ kind: "akun", id: staffActor.accountId });
    expect(entries.at(-1)).toEqual(
      expect.objectContaining({
        at: verifiedAt,
        actor: { accountId: staffActor.accountId, role: "admin_lokasi" },
        action: "akun.email_verifikasi",
        before: { email: "staf@contoh.id", terverifikasi: true },
        after: { email: "baru@contoh.id", terverifikasi: true },
      }),
    );
    expect(JSON.stringify(entries)).not.toContain(code);

    const pemesan = await logIn(setup, "pemesan@contoh.id");
    const pemesanActor = await actorOf(identity, pemesan.cookies);
    await identity.requestEmailVerification(pemesanActor, { email: "pemesan.baru@contoh.id", ip: nextTestIp() });
    await identity.confirmEmailVerification(pemesanActor, { code: emailCodeTo(email, "pemesan.baru@contoh.id") });
    expect(await audit.entriesAbout({ kind: "akun", id: pemesanActor.accountId })).toEqual([]);
  });

  it("an Admin Platform must pass TOTP first, as for every other staff action", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
    const { cookies } = await logIn(setup, "admin@makam.co.id");
    const beforeTotp = await actorOf(identity, cookies);
    const sends = email.sent.length;

    expect(await identity.requestEmailVerification(beforeTotp, { email: "ops@makam.co.id", ip: nextTestIp() })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await identity.confirmEmailVerification(beforeTotp, { code: "123456" })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await identity.updatePhoneNumber(beforeTotp, { phoneNumber: "081222222222" })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(email.sent).toHaveLength(sends);
  });
});

describe("the phone number in Akun Saya", () => {
  it("is edited freely, validated and normalised (+62 only); it cannot be emptied", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;
    const { cookies } = await logIn(setup, "sari@contoh.id");
    const actor = await actorOf(identity, cookies);

    expect(await identity.updatePhoneNumber(actor, { phoneNumber: "0812-3456-7890" })).toEqual({
      ok: true,
      phoneNumber: "+6281234567890",
    });
    expect(await identity.updatePhoneNumber(actor, { phoneNumber: "+1 202 555 0100" })).toEqual({
      ok: false,
      reason: "nomor_bukan_indonesia",
    });
    expect(await identity.updatePhoneNumber(actor, { phoneNumber: "" })).toEqual({ ok: false, reason: "nomor_tidak_valid" });
    expect(await actorOf(identity, cookies)).toMatchObject({ phoneNumber: "+6281234567890" });
  });

  it("an Akun Staf's change is audited with the number before and after; a Pemesan's records nothing", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, audit } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);

    await identity.updatePhoneNumber(admin, { phoneNumber: "081999999999" });

    expect((await audit.entriesAbout({ kind: "akun", id: admin.accountId })).at(-1)).toEqual(
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "akun.ubah_telepon",
        before: { phoneNumber: "+6281111111111" },
        after: { phoneNumber: "+6281999999999" },
      }),
    );
    const pemesan = await logIn(setup, "pemesan@contoh.id", { phoneNumber: "081234567890" });
    expect(await audit.entriesAbout({ kind: "akun", id: pemesan.login.account.id })).toEqual([]);
  });
});
