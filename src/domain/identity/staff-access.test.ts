import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { identityOnTestDatabase, lastOtpTo, logInByOtp, signedInAdminPlatform } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";

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
          expiresAt: "2026-10-08T02:00:00.000Z",
        },
        reason: "Admin baru TPU Wakaf Al-Ikhlas",
      }),
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
    });

    expect(invited).toMatchObject({ ok: true, delivered: false });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"] });
  });

  it("is refused to anyone but an Admin Platform past TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { phoneNumber: INVITEE, email: "lokasi@contoh.id", role: "admin_lokasi" });
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
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_lokasi" });
    await setup.identity.inviteStaff(actor, { phoneNumber: "082222222222", email: "dua@contoh.id", role: "admin_platform" });

    const { login, cookies } = await logInByOtp(setup.identity, setup.whatsapp, "082222222222");

    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform", "admin_lokasi"],
      totp: "perlu_daftar",
    });
    expect(login.session.expiresAt).toEqual(wib("2026-10-01 21:00"));
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
    });
    if (!invited.ok) throw new Error(invited.reason);
    const staff = await logInByOtp(setup.identity, setup.whatsapp, "082222222222");
    return { ...setup, admin, invite: invited.invite, staff };
  }

  it("ends its sessions and blocks its login", async () => {
    const { identity, whatsapp, clock, admin, staff } = await withAdminLokasi();

    expect(
      await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar dari yayasan" }),
    ).toEqual({ ok: true });

    expect(await identity.actorFromCookies(staff.cookies)).toBeNull();
    clock.advance({ minutes: 2 });
    expect(await identity.requestOtp({ phoneNumber: "082222222222" })).toEqual({
      ok: false,
      reason: "akun_dinonaktifkan",
    });
    expect(whatsapp.sent.filter((message) => message.to === "+6282222222222" && message.template === "kode_verifikasi")).toHaveLength(1);
  });

  it("an OTP sent before the deactivation no longer logs in", async () => {
    const { identity, whatsapp, clock, admin, staff } = await withAdminLokasi();
    clock.advance({ minutes: 2 });
    await identity.requestOtp({ phoneNumber: "082222222222" });
    const code = lastOtpTo(whatsapp, "+6282222222222");

    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });

    expect(await identity.verifyOtp({ phoneNumber: "082222222222", code })).toEqual({
      ok: false,
      reason: "akun_dinonaktifkan",
    });
  });

  it("keeps the Akun's history: the same Akun, its roles and its Entri Audit stay, with the deactivation audited", async () => {
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
      roles: ["admin_lokasi"],
      deactivated: true,
    });
    expect(await audit.entriesAbout({ kind: "undangan_staf", id: invite.id })).toHaveLength(1);
    expect(await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: admin.actor.accountId, role: "admin_platform" },
        action: "staf.nonaktifkan",
        before: { deactivated: false, roles: ["admin_lokasi"] },
        after: { deactivated: true, roles: ["admin_lokasi"] },
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

  it("a Dinonaktifkan number cannot be invited again", async () => {
    const { identity, admin, staff } = await withAdminLokasi();
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });

    expect(
      await identity.inviteStaff(admin.actor, { phoneNumber: "082222222222", email: "lokasi@contoh.id", role: "mitra_jasa" }),
    ).toEqual({ ok: false, reason: "akun_dinonaktifkan" });
  });
});
