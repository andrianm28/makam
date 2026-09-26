import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { akunResource, authorize, stafMenuResource } from "./index";
import { actorOf, emailCodeTo, identityOnTestDatabase, logInByOtp, signedInAdminPlatform } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { authenticatorCode } from "../../../tests/support/totp";

/** The Lokasi Mitra an Admin Lokasi invite names (the identity module keeps it as given). */
const LOKASI = "5d1f4c2e-0000-4000-8000-000000000001";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("seeding the first Admin Platform", () => {
  it("creates the first Admin Platform with its WhatsApp number and email; its OTP login holds the role", async () => {
    const { identity, whatsapp } = identityOnTestDatabase(db);

    const seeded = await identity.seedFirstAdminPlatform({ phoneNumber: "0811-1111-1111", email: "Admin@Makam.co.id" });

    expect(seeded).toMatchObject({ ok: true, account: { phoneNumber: "+6281111111111" } });
    const { cookies } = await logInByOtp(identity, whatsapp, "081111111111");
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      phoneNumber: "+6281111111111",
      roles: ["pemesan", "admin_platform"],
    });
    expect(await identity.staffAccounts()).toEqual([
      {
        accountId: expect.any(String),
        phoneNumber: "+6281111111111",
        email: "admin@makam.co.id",
        roles: ["admin_platform"],
        deactivated: false,
      },
    ]);
  });

  it("records an Entri Audit for the seeded Admin Platform", async () => {
    const { identity, audit } = identityOnTestDatabase(db);

    const seeded = await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    if (!seeded.ok) throw new Error(seeded.reason);

    expect(await audit.entriesAbout({ kind: "akun", id: seeded.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: seeded.account.id, role: "seed_cli" },
        action: "staf.seed_admin_platform",
        before: null,
        after: { phoneNumber: "+6281111111111", email: "admin@makam.co.id", roles: ["admin_platform"] },
      }),
    ]);
  });

  it("is refused once an Admin Platform exists: every later one comes by Undangan Staf", async () => {
    const { identity } = identityOnTestDatabase(db);
    await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "082222222222", email: "dua@makam.co.id" })).toEqual({
      ok: false,
      reason: "admin_platform_sudah_ada",
    });
    expect(await identity.accountByPhoneNumber("082222222222")).toBeNull();
  });

  it("needs a valid email and a +62 WhatsApp number", async () => {
    const { identity } = identityOnTestDatabase(db);

    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "" })).toEqual({
      ok: false,
      reason: "email_tidak_valid",
    });
    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "12", email: "admin@makam.co.id" })).toEqual({
      ok: false,
      reason: "nomor_tidak_valid",
    });
    expect(await identity.staffAccounts()).toEqual([]);
  });

  /** A Pemesan on the number, with its own Email Terverifikasi, before the seed reuses its Akun. */
  async function pemesanWithEmailTerverifikasi(setup: ReturnType<typeof identityOnTestDatabase>, address: string) {
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "081111111111");
    await identity.requestEmailVerification(await actorOf(identity, cookies), { email: address, ip: "198.51.100.50" });
    const confirmed = await identity.confirmEmailVerification(await actorOf(identity, cookies), {
      code: emailCodeTo(email, address),
    });
    if (!confirmed.ok) throw new Error(confirmed.reason);
    return cookies;
  }

  it("reusing a Pemesan's Akun with a different email: the new email is not an Email Terverifikasi", async () => {
    const setup = identityOnTestDatabase(db);
    const cookies = await pemesanWithEmailTerverifikasi(setup, "lama@contoh.id");

    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    expect(await setup.identity.accountEmail(await actorOf(setup.identity, cookies))).toEqual({
      email: "admin@makam.co.id",
      verified: false,
    });
  });

  it("reusing a Pemesan's Akun with a different email and emailTerverifikasi: the new email is its Email Terverifikasi, audited by seed_cli", async () => {
    const setup = identityOnTestDatabase(db);
    const cookies = await pemesanWithEmailTerverifikasi(setup, "lama@contoh.id");

    const seeded = await setup.identity.seedFirstAdminPlatform({
      phoneNumber: "081111111111",
      email: "admin@makam.co.id",
      emailTerverifikasi: true,
    });

    expect(seeded).toMatchObject({ ok: true });
    expect(await setup.identity.accountEmail(await actorOf(setup.identity, cookies))).toEqual({
      email: "admin@makam.co.id",
      verified: true,
    });
    const actor = await actorOf(setup.identity, cookies);
    const entries = await setup.audit.entriesAbout({ kind: "akun", id: actor.accountId });
    expect(entries.map((entry) => [entry.action, entry.actor.role])).toEqual([
      ["staf.seed_admin_platform", "seed_cli"],
      ["akun.email_verifikasi", "seed_cli"],
    ]);
  });

  it("reusing a Pemesan's Akun whose Email Terverifikasi is the seeded email, with emailTerverifikasi: it stays verified and the seed succeeds", async () => {
    const setup = identityOnTestDatabase(db);
    const cookies = await pemesanWithEmailTerverifikasi(setup, "admin@makam.co.id");

    const seeded = await setup.identity.seedFirstAdminPlatform({
      phoneNumber: "081111111111",
      email: "Admin@Makam.co.id",
      emailTerverifikasi: true,
    });

    expect(seeded).toMatchObject({ ok: true });
    expect(await setup.identity.accountEmail(await actorOf(setup.identity, cookies))).toEqual({
      email: "admin@makam.co.id",
      verified: true,
    });
  });
});

describe("Undangan Staf", () => {
  const INVITEE = "082222222222";

  it("Admin Platform invites by WhatsApp number and email with a role; the invitee logs in by OTP and holds the role", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp } = setup;
    const { actor } = await signedInAdminPlatform(setup);

    const invited = await identity.inviteStaff(actor, {
      phoneNumber: "0822-2222-2222",
      email: "Lokasi@Contoh.id",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });

    expect(invited).toMatchObject({
      ok: true,
      delivered: true,
      invite: {
        phoneNumber: "+6282222222222",
        email: "lokasi@contoh.id",
        role: "admin_lokasi",
        expiresAt: wib("2026-10-08 09:00"),
      },
    });
    expect(whatsapp.sent.filter((message) => message.template === "staf_undangan")).toEqual([
      expect.objectContaining({
        to: "+6282222222222",
        language: "id",
        parameters: ["Admin Lokasi", "http://localhost:3000/masuk"],
      }),
    ]);

    const { login, cookies } = await logInByOtp(identity, whatsapp, INVITEE);
    expect(login.roles).toEqual(["pemesan", "admin_lokasi"]);
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      phoneNumber: "+6282222222222",
      roles: ["pemesan", "admin_lokasi"],
      totp: "tidak_perlu",
    });
    expect(await identity.staffAccounts()).toContainEqual({
      accountId: expect.any(String),
      phoneNumber: "+6282222222222",
      email: "lokasi@contoh.id",
      roles: ["admin_lokasi"],
      deactivated: false,
    });
  });

  it.each(["admin_platform", "admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const)(
    "an Undangan Staf for %s without an email is rejected",
    async (role) => {
      const setup = identityOnTestDatabase(db);
      const { actor } = await signedInAdminPlatform(setup);

      expect(await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "", role })).toEqual({
        ok: false,
        reason: "email_wajib",
      });
      expect(await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "bukan-email", role })).toEqual({
        ok: false,
        reason: "email_tidak_valid",
      });
      expect(setup.whatsapp.sent.filter((message) => message.template === "staf_undangan")).toEqual([]);
      expect(await setup.identity.openStaffInvites()).toEqual([]);
    },
  );

  it("an Undangan Staf for Admin Lokasi names its Lokasi Mitra: without one it is refused and nothing is sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);

    for (const lokasiId of [undefined, null, " "]) {
      expect(
        await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "lokasi@contoh.id", role: "admin_lokasi", lokasiId }),
      ).toEqual({ ok: false, reason: "lokasi_wajib" });
    }
    expect(setup.whatsapp.sent.filter((message) => message.template === "staf_undangan")).toEqual([]);
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("an accepted Admin Lokasi invite makes the Akun Admin Lokasi of that Lokasi Mitra; a second invite adds another, all equal", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    const OTHER = "5d1f4c2e-0000-4000-8000-000000000002";
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "lokasi@contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    const first = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);
    expect(await setup.identity.actorFromCookies(first.cookies)).toMatchObject({ lokasiIds: [LOKASI] });

    setup.clock.advance({ minutes: 5 });
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "lokasi@contoh.id", role: "admin_lokasi", lokasiId: OTHER });
    const second = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);

    expect(await setup.identity.actorFromCookies(second.cookies)).toMatchObject({
      roles: ["pemesan", "admin_lokasi"],
      lokasiIds: [LOKASI, OTHER],
    });
    expect(await setup.identity.adminLokasiOf(OTHER)).toEqual([
      { accountId: second.login.account.id, phoneNumber: "+6282222222222", email: "lokasi@contoh.id" },
    ]);
  });

  it("is single-use: once the invitee has logged in it is no longer open", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "petugas@contoh.id", role: "petugas_lapangan" });
    expect(await setup.identity.openStaffInvites()).toMatchObject([{ phoneNumber: "+6282222222222" }]);

    await logInByOtp(setup.identity, setup.whatsapp, INVITEE);

    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("expires 7 days after it was sent: a later login by that number gets no staff role", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "mitra@contoh.id", role: "mitra_jasa" });

    setup.clock.set(wib("2026-10-08 09:00"));
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);

    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan"] });
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("records an Entri Audit: Admin Platform, the Clock time, the invite and its reason", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);

    const invited = await setup.identity.inviteStaff(actor, {
      phoneNumber: INVITEE,
      email: "lokasi@contoh.id",
      role: "admin_lokasi",
      lokasiId: LOKASI,
      reason: "Admin baru TPU Wakaf Al-Ikhlas",
    });
    if (!invited.ok) throw new Error(invited.reason);

    expect(await setup.audit.entriesAbout({ kind: "undangan_staf", id: invited.invite.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: actor.accountId, role: "admin_platform" },
        action: "staf.undang",
        before: null,
        after: {
          phoneNumber: "+6282222222222",
          email: "lokasi@contoh.id",
          role: "admin_lokasi",
          lokasiId: LOKASI,
          expiresAt: "2026-10-08T02:00:00.000Z",
        },
        reason: "Admin baru TPU Wakaf Al-Ikhlas",
      }),
    ]);
  });

  it("accepting it grants the role with an Entri Audit on the Akun, in the same step as the grant", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    const invited = await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "Lokasi@Contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    if (!invited.ok) throw new Error(invited.reason);
    setup.clock.advance({ hours: 1 });

    const { login } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);

    expect(await setup.audit.entriesAbout({ kind: "akun", id: login.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 10:00"),
        actor: { accountId: login.account.id, role: "pemesan" },
        action: "staf.peran_diberikan",
        before: { roles: [], email: null },
        after: { roles: ["admin_lokasi"], email: "lokasi@contoh.id", lokasiId: LOKASI, undanganStafId: invited.invite.id },
        reason: null,
      }),
    ]);
  });

  it("two open invites for one number grant both roles, one Entri Audit per role", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "dua@contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "dua@contoh.id", role: "petugas_lapangan" });

    const { login } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);

    const grants = (await setup.audit.entriesAbout({ kind: "akun", id: login.account.id })).filter(
      (entry) => entry.action === "staf.peran_diberikan",
    );
    expect(grants.map((entry) => [entry.before?.roles, entry.after?.roles])).toEqual([
      [[], ["admin_lokasi"]],
      [["admin_lokasi"], ["admin_lokasi", "petugas_lapangan"]],
    ]);
  });

  it("still stands when WhatsApp cannot deliver it: the invitee can log in by OTP all the same", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    const failing = setup.whatsapp.sendTemplate.bind(setup.whatsapp);
    setup.whatsapp.sendTemplate = async (message) => {
      if (message.template === "staf_undangan") throw new Error("kirim.dev unavailable");
      return failing(message);
    };

    const invited = await setup.identity.inviteStaff(actor, {
      phoneNumber: INVITEE,
      email: "lokasi@contoh.id",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });

    expect(invited).toMatchObject({ ok: true, delivered: false });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"] });
  });

  it("is refused to anyone but an Admin Platform past TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "lokasi@contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);
    const adminLokasi = await setup.identity.actorFromCookies(cookies);
    if (!adminLokasi) throw new Error("not signed in");

    expect(
      await setup.identity.inviteStaff(adminLokasi, { phoneNumber: "083333333333", email: "x@contoh.id", role: "admin_platform" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    setup.clock.advance({ minutes: 5 });
    const again = await logInByOtp(setup.identity, setup.whatsapp, "081111111111");
    const adminBeforeTotp = await setup.identity.actorFromCookies(again.cookies);
    if (!adminBeforeTotp) throw new Error("not signed in");
    expect(
      await setup.identity.inviteStaff(adminBeforeTotp, { phoneNumber: "083333333333", email: "x@contoh.id", role: "mitra_jasa" }),
    ).toEqual({ ok: false, reason: "perlu_totp" });
    expect(await setup.identity.accountByPhoneNumber("083333333333")).toBeNull();
  });
});

describe("staff sessions", () => {
  it("an Akun Staf without Admin Platform needs no TOTP and its session lasts 30 days on the Clock", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "p@contoh.id", role: "petugas_lapangan" });

    const { login, cookies } = await logInByOtp(setup.identity, setup.whatsapp, "082222222222");

    expect(login.session.expiresAt).toEqual(wib("2026-10-31 09:00"));
    expect(login.session.cookies.find((cookie) => cookie.name === "makam.session_token")?.maxAge).toBe(30 * 86_400);
    setup.clock.set(wib("2026-10-31 08:59"));
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ totp: "tidak_perlu" });
    setup.clock.set(wib("2026-10-31 09:00"));
    expect(await setup.identity.actorFromCookies(cookies)).toBeNull();
  });

  it("an Akun holding Admin Platform and Admin Lokasi gets the 12 h session and must pass TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_platform" });

    const { login, cookies } = await logInByOtp(setup.identity, setup.whatsapp, "082222222222");

    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform", "admin_lokasi"],
      totp: "perlu_daftar",
    });
    expect(login.session.expiresAt).toEqual(wib("2026-10-01 21:00"));
  });

  it("an Admin Lokasi who accepts an Admin Platform invite on a new login: the session on the other device ends", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, clock } = setup;
    const { actor } = await signedInAdminPlatform(setup);
    await identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_lokasi", lokasiId: LOKASI });
    const otherDevice = await logInByOtp(identity, whatsapp, "082222222222");
    expect(await identity.actorFromCookies(otherDevice.cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"] });

    await identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_platform" });
    clock.advance({ minutes: 5 });
    const newLogin = await logInByOtp(identity, whatsapp, "082222222222");

    expect(await identity.actorFromCookies(otherDevice.cookies)).toBeNull();
    expect(await identity.actorFromCookies(newLogin.cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform", "admin_lokasi"],
      totp: "perlu_daftar",
    });
    expect(newLogin.login.session.expiresAt).toEqual(wib("2026-10-01 21:05"));
  });

  it("a Pemesan who accepts an Undangan Staf on a new login: the 90-day Pemesan session on the other device ends", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, clock } = setup;
    const { actor } = await signedInAdminPlatform(setup);
    const pemesanDevice = await logInByOtp(identity, whatsapp, "082222222222");

    await identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "petugas_lapangan" });
    clock.advance({ minutes: 5 });
    const newLogin = await logInByOtp(identity, whatsapp, "082222222222");

    expect(await identity.actorFromCookies(pemesanDevice.cookies)).toBeNull();
    expect(await identity.actorFromCookies(newLogin.cookies)).toMatchObject({ roles: ["pemesan", "petugas_lapangan"] });
  });
});

describe("deactivating an Akun Staf", () => {
  async function withAdminLokasi() {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const invited = await setup.identity.inviteStaff(admin.actor, {
      phoneNumber: "082222222222",
      email: "lokasi@contoh.id",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });
    if (!invited.ok) throw new Error(invited.reason);
    const staff = await logInByOtp(setup.identity, setup.whatsapp, "082222222222");
    return { ...setup, admin, invite: invited.invite, staff };
  }

  it("revokes its staff roles and ends its sessions: the old staff session no longer grants staff access", async () => {
    const { identity, admin, staff } = await withAdminLokasi();
    const before = await identity.actorFromCookies(staff.cookies);
    expect(authorize(before, "staf.menu", stafMenuResource("admin_lokasi"))).toEqual({ allowed: true });

    expect(
      await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar dari yayasan" }),
    ).toEqual({ ok: true });

    const after = await identity.actorFromCookies(staff.cookies);
    expect(after).toBeNull();
    expect(authorize(after, "staf.menu", stafMenuResource("admin_lokasi"))).toMatchObject({ allowed: false });
  });

  it("a Dinonaktifkan Admin Lokasi can still log in as a Pemesan and open Akun Saya, but not the staff area", async () => {
    const { identity, whatsapp, clock, admin, staff } = await withAdminLokasi();
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Kontrak selesai" });

    clock.advance({ minutes: 2 });
    const again = await logInByOtp(identity, whatsapp, "082222222222");

    expect(again.login).toMatchObject({ accountCreated: false, account: { id: staff.login.account.id }, roles: ["pemesan"] });
    const actor = await identity.actorFromCookies(again.cookies);
    expect(actor).toMatchObject({ roles: ["pemesan"], totp: "tidak_perlu" });
    expect(authorize(actor, "akun.lihat", akunResource(staff.login.account.id))).toEqual({ allowed: true });
    expect(authorize(actor, "staf.menu", stafMenuResource("admin_lokasi"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    // A Pemesan session again: 90 days.
    expect(again.login.session.expiresAt).toEqual(wib("2026-12-30 09:02"));
  });

  it("keeps the Akun's history: the same Akun and its Entri Audit stay, with the deactivation audited", async () => {
    const { identity, audit, admin, invite, staff } = await withAdminLokasi();

    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Kontrak selesai" });
    expect(await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "lagi" })).toEqual({
      ok: false,
      reason: "sudah_dinonaktifkan",
    });

    expect(await identity.staffAccounts()).toContainEqual({
      accountId: staff.login.account.id,
      phoneNumber: "+6282222222222",
      email: "lokasi@contoh.id",
      roles: [],
      deactivated: true,
    });
    expect(await audit.entriesAbout({ kind: "undangan_staf", id: invite.id })).toHaveLength(1);
    expect(await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).toEqual([
      expect.objectContaining({ action: "staf.peran_diberikan", after: expect.objectContaining({ roles: ["admin_lokasi"] }) }),
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: admin.actor.accountId, role: "admin_platform" },
        action: "staf.nonaktifkan",
        before: { deactivated: false, roles: ["admin_lokasi"], lokasiIds: [LOKASI] },
        after: { deactivated: true, roles: [], lokasiIds: [] },
        reason: "Kontrak selesai",
      }),
    ]);
  });

  it("needs a reason, an Akun Staf other than one's own, and an Admin Platform past TOTP", async () => {
    const { identity, admin, staff, whatsapp } = await withAdminLokasi();
    const adminLokasi = await identity.actorFromCookies(staff.cookies);
    if (!adminLokasi) throw new Error("not signed in");
    const pemesan = await logInByOtp(identity, whatsapp, "083333333333");

    expect(await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: " " })).toEqual({
      ok: false,
      reason: "alasan_wajib",
    });
    expect(await identity.deactivateStaff(admin.actor, { accountId: pemesan.login.account.id, reason: "x" })).toEqual({
      ok: false,
      reason: "bukan_akun_staf",
    });
    expect(await identity.deactivateStaff(admin.actor, { accountId: admin.actor.accountId, reason: "x" })).toEqual({
      ok: false,
      reason: "akun_sendiri",
    });
    expect(await identity.deactivateStaff(adminLokasi, { accountId: admin.actor.accountId, reason: "x" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect((await identity.staffAccounts()).every((account) => !account.deactivated)).toBe(true);
  });

  it("a Dinonaktifkan number can be invited again: accepting grants the role, and every step is audited", async () => {
    const { identity, whatsapp, clock, audit, admin, staff } = await withAdminLokasi();
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });
    clock.advance({ days: 30 });

    const reinvited = await identity.inviteStaff(admin.actor, {
      phoneNumber: "082222222222",
      email: "kembali@contoh.id",
      role: "mitra_jasa",
      reason: "Bergabung lagi sebagai Mitra Jasa",
    });
    expect(reinvited).toMatchObject({ ok: true, invite: { role: "mitra_jasa" } });
    if (!reinvited.ok) throw new Error(reinvited.reason);
    const again = await logInByOtp(identity, whatsapp, "082222222222");

    expect(again.login).toMatchObject({ account: { id: staff.login.account.id }, roles: ["pemesan", "mitra_jasa"] });
    expect(await identity.staffAccounts()).toContainEqual({
      accountId: staff.login.account.id,
      phoneNumber: "+6282222222222",
      email: "kembali@contoh.id",
      roles: ["mitra_jasa"],
      deactivated: false,
    });
    expect((await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).map((entry) => entry.action)).toEqual([
      "staf.peran_diberikan",
      "staf.nonaktifkan",
      "staf.peran_diberikan",
    ]);
    expect(await audit.entriesAbout({ kind: "undangan_staf", id: reinvited.invite.id })).toEqual([
      expect.objectContaining({ action: "staf.undang", reason: "Bergabung lagi sebagai Mitra Jasa" }),
    ]);
    expect(await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).toContainEqual(
      expect.objectContaining({
        action: "staf.peran_diberikan",
        before: { roles: [], email: "lokasi@contoh.id" },
        after: { roles: ["mitra_jasa"], email: "kembali@contoh.id", undanganStafId: reinvited.invite.id },
      }),
    );
  });

  it("a Dinonaktifkan Admin Lokasi is no longer Admin Lokasi of its Lokasi Mitra, even when invited back to another one", async () => {
    const { identity, whatsapp, clock, admin, staff } = await withAdminLokasi();
    const OTHER = "5d1f4c2e-0000-4000-8000-000000000002";
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });
    expect(await identity.adminLokasiOf(LOKASI)).toEqual([]);
    clock.advance({ days: 30 });

    await identity.inviteStaff(admin.actor, { phoneNumber: "082222222222", email: "kembali@contoh.id", role: "admin_lokasi", lokasiId: OTHER });
    const again = await logInByOtp(identity, whatsapp, "082222222222");

    expect(await identity.actorFromCookies(again.cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"], lokasiIds: [OTHER] });
    expect(await identity.adminLokasiOf(LOKASI)).toEqual([]);
  });

  it("a Dinonaktifkan Admin Platform invited back must enrol a new authenticator: deactivation clears its TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, clock } = setup;
    const admin = await signedInAdminPlatform(setup);
    await identity.inviteStaff(admin.actor, { phoneNumber: "082222222222", email: "dua@makam.co.id", role: "admin_platform" });
    const second = await logInByOtp(identity, whatsapp, "082222222222");
    const enrolment = await identity.startTotpEnrolment(await actorOf(identity, second.cookies));
    if (!enrolment.ok) throw new Error(enrolment.reason);
    expect(await identity.passTotp(await actorOf(identity, second.cookies), authenticatorCode(enrolment.secret, clock.now()))).toEqual({ ok: true });

    await identity.deactivateStaff(admin.actor, { accountId: second.login.account.id, reason: "Cuti panjang" });
    clock.advance({ days: 1 });
    await identity.inviteStaff(admin.actor, { phoneNumber: "082222222222", email: "dua@makam.co.id", role: "admin_platform" });
    const back = await logInByOtp(identity, whatsapp, "082222222222");

    expect(await identity.actorFromCookies(back.cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform"],
      totp: "perlu_daftar",
    });
  });
});

describe("reads are not audited", () => {
  it("reading the Akun Staf, the open Undangan Staf and an entity's Entri Audit records nothing", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "mitra_jasa" });
    const before = await setup.audit.allEntries();
    expect(before.length).toBeGreaterThan(0);

    await setup.identity.staffAccounts();
    await setup.identity.openStaffInvites();
    await setup.audit.entriesAbout({ kind: "akun", id: actor.accountId });
    await setup.identity.actorFromCookies(null);

    expect(await setup.audit.allEntries()).toEqual(before);
  });
});
