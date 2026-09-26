import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmailSender } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { akunResource, authorize, stafMenuResource } from "./index";
import { actorOf, identityOnTestDatabase, logIn, signedInAdminPlatform } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { authenticatorCode } from "../../../tests/support/totp";

/** The Lokasi Mitra an Admin Lokasi invite names (the identity module keeps it as given). */
const LOKASI = "5d1f4c2e-0000-4000-8000-000000000001";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("seeding the first Admin Platform", () => {
  it("seeds the first Admin Platform by its email, as its Email Terverifikasi, with a contact phone number; its Kode Masuk login holds the role", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;

    const seeded = await identity.seedFirstAdminPlatform({ email: "Admin@Makam.co.id", phoneNumber: "0811-1111-1111" });

    expect(seeded).toMatchObject({ ok: true, account: { email: "admin@makam.co.id", phoneNumber: "+6281111111111" } });
    const { login, cookies } = await logIn(setup, "admin@makam.co.id");
    expect(login.accountCreated).toBe(false);
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      email: "admin@makam.co.id",
      phoneNumber: "+6281111111111",
      roles: ["pemesan", "admin_platform"],
    });
    expect(await identity.staffAccounts()).toEqual([
      {
        accountId: expect.any(String),
        email: "admin@makam.co.id",
        emailTerverifikasi: true,
        phoneNumber: "+6281111111111",
        roles: ["admin_platform"],
        deactivated: false,
      },
    ]);
  });

  it("records an Entri Audit for the seeded Admin Platform", async () => {
    const { identity, audit } = identityOnTestDatabase(db);

    const seeded = await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
    if (!seeded.ok) throw new Error(seeded.reason);

    expect(await audit.entriesAbout({ kind: "akun", id: seeded.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: seeded.account.id, role: "seed_cli" },
        action: "staf.seed_admin_platform",
        before: null,
        after: { email: "admin@makam.co.id", emailTerverifikasi: true, phoneNumber: "+6281111111111", roles: ["admin_platform"] },
      }),
    ]);
  });

  it("is refused once an Admin Platform exists: every later one comes by Undangan Staf", async () => {
    const { identity } = identityOnTestDatabase(db);
    await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });

    expect(await identity.seedFirstAdminPlatform({ email: "dua@makam.co.id", phoneNumber: "082222222222" })).toEqual({
      ok: false,
      reason: "admin_platform_sudah_ada",
    });
    expect(await identity.accountByEmail("dua@makam.co.id")).toBeNull();
  });

  it("needs a valid email and a +62 phone number", async () => {
    const { identity } = identityOnTestDatabase(db);

    expect(await identity.seedFirstAdminPlatform({ email: "", phoneNumber: "081111111111" })).toEqual({
      ok: false,
      reason: "email_tidak_valid",
    });
    expect(await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "12" })).toEqual({
      ok: false,
      reason: "nomor_tidak_valid",
    });
    expect(await identity.staffAccounts()).toEqual([]);
  });

  it("an Akun that already has the seeded email as its Email Terverifikasi becomes the Admin Platform", async () => {
    const setup = identityOnTestDatabase(db);
    const pemesan = await logIn(setup, "admin@makam.co.id");

    const seeded = await setup.identity.seedFirstAdminPlatform({ email: "ADMIN@makam.co.id", phoneNumber: "081111111111" });

    expect(seeded).toMatchObject({ ok: true, account: { id: pemesan.login.account.id } });
    expect(await setup.identity.accountByEmail("admin@makam.co.id")).toEqual({
      id: pemesan.login.account.id,
      email: "admin@makam.co.id",
      phoneNumber: "+6281111111111",
    });
  });
});

describe("Undangan Staf", () => {
  const INVITEE = "lokasi@contoh.id";

  it("Admin Platform invites an email (phone as contact) with a role, sent by email; the Akun with that Email Terverifikasi holds the role at its next Kode Masuk", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    const { actor } = await signedInAdminPlatform(setup);

    const invited = await identity.inviteStaff(actor, {
      email: "Lokasi@Contoh.id",
      phoneNumber: "0822-2222-2222",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });

    expect(invited).toMatchObject({
      ok: true,
      delivered: true,
      invite: { email: INVITEE, phoneNumber: "+6282222222222", role: "admin_lokasi", expiresAt: wib("2026-10-08 09:00") },
    });
    const sent = email.sent.filter((message) => message.subject.startsWith("Undangan Staf"));
    expect(sent).toEqual([expect.objectContaining({ to: INVITEE, subject: "Undangan Staf Makam.co.id: Admin Lokasi" })]);
    expect(sent[0].text).toContain("http://localhost:3000/masuk");

    const { login, cookies } = await logIn(setup, INVITEE);
    expect(login).toMatchObject({ accountCreated: true, roles: ["pemesan", "admin_lokasi"] });
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      email: INVITEE,
      // The invite's phone number becomes the new Akun's contact.
      phoneNumber: "+6282222222222",
      roles: ["pemesan", "admin_lokasi"],
      totp: "tidak_perlu",
    });
    expect(await identity.staffAccounts()).toContainEqual(
      expect.objectContaining({ email: INVITEE, roles: ["admin_lokasi"], deactivated: false }),
    );
  });

  it("an Undangan Staf is accepted by the Akun with that Email Terverifikasi, and by no other Akun; the Akun keeps its own phone number", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;
    const { actor } = await signedInAdminPlatform(setup);
    const existing = await logIn(setup, INVITEE, { phoneNumber: "081999999999" });
    const other = await logIn(setup, "lain@contoh.id", { phoneNumber: "082222222222" });

    await identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "082222222222", role: "petugas_lapangan" });
    setup.clock.advance({ minutes: 1 });
    const otherAgain = await logIn(setup, "lain@contoh.id");
    const again = await logIn(setup, INVITEE);

    expect(otherAgain.login.roles).toEqual(["pemesan"]);
    expect(again.login).toMatchObject({
      account: { id: existing.login.account.id, phoneNumber: "+6281999999999" },
      roles: ["pemesan", "petugas_lapangan"],
    });
    expect(other.login.account.id).not.toBe(existing.login.account.id);
  });

  it.each(["admin_platform", "admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const)(
    "an Undangan Staf for %s needs an email and a +62 phone number",
    async (role) => {
      const setup = identityOnTestDatabase(db);
      const { actor } = await signedInAdminPlatform(setup);
      const sends = setup.email.sent.length;

      expect(await setup.identity.inviteStaff(actor, { email: "", phoneNumber: "082222222222", role })).toEqual({
        ok: false,
        reason: "email_wajib",
      });
      expect(await setup.identity.inviteStaff(actor, { email: "bukan-email", phoneNumber: "082222222222", role })).toEqual({
        ok: false,
        reason: "email_tidak_valid",
      });
      expect(await setup.identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "", role })).toEqual({
        ok: false,
        reason: "nomor_tidak_valid",
      });
      expect(setup.email.sent).toHaveLength(sends);
      expect(await setup.identity.openStaffInvites()).toEqual([]);
    },
  );

  it("an Undangan Staf for Admin Lokasi names its Lokasi Mitra: without one it is refused and nothing is sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    const sends = setup.email.sent.length;

    for (const lokasiId of [undefined, null, " "]) {
      expect(
        await setup.identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "082222222222", role: "admin_lokasi", lokasiId }),
      ).toEqual({ ok: false, reason: "lokasi_wajib" });
    }
    expect(setup.email.sent).toHaveLength(sends);
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("an accepted Admin Lokasi invite makes the Akun Admin Lokasi of that Lokasi Mitra; a second invite adds another, all equal", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    const OTHER = "5d1f4c2e-0000-4000-8000-000000000002";
    await setup.identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    const first = await logIn(setup, INVITEE);
    expect(await setup.identity.actorFromCookies(first.cookies)).toMatchObject({ lokasiIds: [LOKASI] });

    setup.clock.advance({ minutes: 5 });
    await setup.identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: OTHER });
    const second = await logIn(setup, INVITEE);

    expect(await setup.identity.actorFromCookies(second.cookies)).toMatchObject({
      roles: ["pemesan", "admin_lokasi"],
      lokasiIds: [LOKASI, OTHER],
    });
    expect(await setup.identity.adminLokasiOf(OTHER)).toEqual([
      { accountId: second.login.account.id, email: INVITEE, phoneNumber: "+6282222222222" },
    ]);
  });

  it("is single-use: once the invitee has logged in it is no longer open", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: "petugas@contoh.id", phoneNumber: "082222222222", role: "petugas_lapangan" });
    expect(await setup.identity.openStaffInvites()).toMatchObject([{ email: "petugas@contoh.id", phoneNumber: "+6282222222222" }]);

    await logIn(setup, "petugas@contoh.id");

    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("expires 7 days after it was sent: a later login with that email gets no staff role", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: "mitra@contoh.id", phoneNumber: "082222222222", role: "mitra_jasa" });

    setup.clock.set(wib("2026-10-08 09:00"));
    const { cookies } = await logIn(setup, "mitra@contoh.id");

    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan"] });
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });

  it("records an Entri Audit: Admin Platform, the Clock time, the invite and its reason", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);

    const invited = await setup.identity.inviteStaff(actor, {
      email: INVITEE,
      phoneNumber: "082222222222",
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
          email: INVITEE,
          phoneNumber: "+6282222222222",
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
    const invited = await setup.identity.inviteStaff(actor, { email: "Lokasi@Contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    if (!invited.ok) throw new Error(invited.reason);
    setup.clock.advance({ hours: 1 });

    const { login } = await logIn(setup, INVITEE);

    expect(await setup.audit.entriesAbout({ kind: "akun", id: login.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 10:00"),
        actor: { accountId: login.account.id, role: "pemesan" },
        action: "staf.peran_diberikan",
        before: { roles: [], phoneNumber: null },
        after: { roles: ["admin_lokasi"], phoneNumber: "+6282222222222", lokasiId: LOKASI, undanganStafId: invited.invite.id },
        reason: null,
      }),
    ]);
  });

  it("two open invites for one email grant both roles, one Entri Audit per role", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    await setup.identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "petugas_lapangan" });

    const { login } = await logIn(setup, "dua@contoh.id");

    const grants = (await setup.audit.entriesAbout({ kind: "akun", id: login.account.id })).filter(
      (entry) => entry.action === "staf.peran_diberikan",
    );
    expect(grants.map((entry) => [entry.before?.roles, entry.after?.roles])).toEqual([
      [[], ["admin_lokasi"]],
      [["admin_lokasi"], ["admin_lokasi", "petugas_lapangan"]],
    ]);
  });

  it("still stands when the EmailSender cannot deliver it: the invitee can log in with a Kode Masuk all the same", async () => {
    const fake = new FakeEmailSender();
    const setup = identityOnTestDatabase(db, { email: fake });
    const { actor } = await signedInAdminPlatform(setup);
    fake.failNextSend();

    const invited = await setup.identity.inviteStaff(actor, {
      email: INVITEE,
      phoneNumber: "082222222222",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });

    expect(invited).toMatchObject({ ok: true, delivered: false });
    const { login, cookies } = await logIn(setup, INVITEE);
    expect(login.roles).toEqual(["pemesan", "admin_lokasi"]);
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"] });
  });

  it("is refused to anyone but an Admin Platform past TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: INVITEE, phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    const adminLokasi = await actorOf(setup.identity, (await logIn(setup, INVITEE)).cookies);

    expect(
      await setup.identity.inviteStaff(adminLokasi, { email: "x@contoh.id", phoneNumber: "083333333333", role: "admin_platform" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    setup.clock.advance({ minutes: 5 });
    const adminBeforeTotp = await actorOf(setup.identity, (await logIn(setup, "admin@makam.co.id")).cookies);
    expect(
      await setup.identity.inviteStaff(adminBeforeTotp, { email: "x@contoh.id", phoneNumber: "083333333333", role: "mitra_jasa" }),
    ).toEqual({ ok: false, reason: "perlu_totp" });
    expect(await setup.identity.openStaffInvites()).toMatchObject([]);
  });
});

describe("staff sessions", () => {
  it("an Akun Staf without Admin Platform needs no TOTP and its session lasts 30 days on the Clock", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: "p@contoh.id", phoneNumber: "082222222222", role: "petugas_lapangan" });

    const { login, cookies } = await logIn(setup, "p@contoh.id");

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
    await setup.identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    await setup.identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "admin_platform" });

    const { login, cookies } = await logIn(setup, "dua@contoh.id");

    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform", "admin_lokasi"],
      totp: "perlu_daftar",
    });
    expect(login.session.expiresAt).toEqual(wib("2026-10-01 21:00"));
  });

  it("an Admin Lokasi who accepts an Admin Platform invite on a new login: the session on the other device ends", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const { actor } = await signedInAdminPlatform(setup);
    await identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    const otherDevice = await logIn(setup, "dua@contoh.id");
    expect(await identity.actorFromCookies(otherDevice.cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"] });

    await identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "admin_platform" });
    clock.advance({ minutes: 5 });
    const newLogin = await logIn(setup, "dua@contoh.id");

    expect(await identity.actorFromCookies(otherDevice.cookies)).toBeNull();
    expect(await identity.actorFromCookies(newLogin.cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform", "admin_lokasi"],
      totp: "perlu_daftar",
    });
    expect(newLogin.login.session.expiresAt).toEqual(wib("2026-10-01 21:05"));
  });

  it("a Pemesan who accepts an Undangan Staf on a new login: the 90-day Pemesan session on the other device ends", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const { actor } = await signedInAdminPlatform(setup);
    const pemesanDevice = await logIn(setup, "dua@contoh.id");

    await identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "petugas_lapangan" });
    clock.advance({ minutes: 5 });
    const newLogin = await logIn(setup, "dua@contoh.id");

    expect(await identity.actorFromCookies(pemesanDevice.cookies)).toBeNull();
    expect(await identity.actorFromCookies(newLogin.cookies)).toMatchObject({ roles: ["pemesan", "petugas_lapangan"] });
  });
});

describe("deactivating an Akun Staf", () => {
  async function withAdminLokasi() {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const invited = await setup.identity.inviteStaff(admin.actor, {
      email: "lokasi@contoh.id",
      phoneNumber: "082222222222",
      role: "admin_lokasi",
      lokasiId: LOKASI,
    });
    if (!invited.ok) throw new Error(invited.reason);
    const staff = await logIn(setup, "lokasi@contoh.id", { phoneNumber: "082222222222" });
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
    const setup = await withAdminLokasi();
    const { identity, clock, admin, staff } = setup;
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Kontrak selesai" });

    clock.advance({ minutes: 2 });
    const again = await logIn(setup, "lokasi@contoh.id");

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
      email: "lokasi@contoh.id",
      emailTerverifikasi: true,
      phoneNumber: "+6282222222222",
      roles: [],
      deactivated: true,
    });
    expect(await audit.entriesAbout({ kind: "undangan_staf", id: invite.id })).toHaveLength(1);
    expect((await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).map((entry) => entry.action)).toEqual([
      "staf.peran_diberikan",
      "akun.ubah_telepon",
      "staf.nonaktifkan",
    ]);
    expect((await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).at(-1)).toEqual(
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: admin.actor.accountId, role: "admin_platform" },
        action: "staf.nonaktifkan",
        before: { deactivated: false, roles: ["admin_lokasi"], lokasiIds: [LOKASI] },
        after: { deactivated: true, roles: [], lokasiIds: [] },
        reason: "Kontrak selesai",
      }),
    );
  });

  it("needs a reason, an Akun Staf other than one's own, and an Admin Platform past TOTP", async () => {
    const setup = await withAdminLokasi();
    const { identity, admin, staff } = setup;
    const adminLokasi = await actorOf(identity, staff.cookies);
    const pemesan = await logIn(setup, "pemesan@contoh.id");

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

  it("re-inviting a Dinonaktifkan Akun still reactivates it: accepting grants the role, and every step is audited", async () => {
    const setup = await withAdminLokasi();
    const { identity, clock, audit, admin, staff } = setup;
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });
    clock.advance({ days: 30 });

    const reinvited = await identity.inviteStaff(admin.actor, {
      email: "lokasi@contoh.id",
      phoneNumber: "082222222222",
      role: "mitra_jasa",
      reason: "Bergabung lagi sebagai Mitra Jasa",
    });
    expect(reinvited).toMatchObject({ ok: true, invite: { role: "mitra_jasa" } });
    if (!reinvited.ok) throw new Error(reinvited.reason);
    const again = await logIn(setup, "lokasi@contoh.id");

    expect(again.login).toMatchObject({ account: { id: staff.login.account.id }, roles: ["pemesan", "mitra_jasa"] });
    expect(await identity.staffAccounts()).toContainEqual(
      expect.objectContaining({ accountId: staff.login.account.id, roles: ["mitra_jasa"], deactivated: false }),
    );
    expect((await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).map((entry) => entry.action)).toEqual([
      "staf.peran_diberikan",
      "akun.ubah_telepon",
      "staf.nonaktifkan",
      "staf.peran_diberikan",
    ]);
    expect(await audit.entriesAbout({ kind: "undangan_staf", id: reinvited.invite.id })).toEqual([
      expect.objectContaining({ action: "staf.undang", reason: "Bergabung lagi sebagai Mitra Jasa" }),
    ]);
    expect(await audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).toContainEqual(
      expect.objectContaining({
        action: "staf.peran_diberikan",
        before: { roles: [] },
        after: { roles: ["mitra_jasa"], undanganStafId: reinvited.invite.id },
      }),
    );
  });

  it("a Dinonaktifkan Admin Lokasi is no longer Admin Lokasi of its Lokasi Mitra, even when invited back to another one", async () => {
    const setup = await withAdminLokasi();
    const { identity, clock, admin, staff } = setup;
    const OTHER = "5d1f4c2e-0000-4000-8000-000000000002";
    await identity.deactivateStaff(admin.actor, { accountId: staff.login.account.id, reason: "Keluar" });
    expect(await identity.adminLokasiOf(LOKASI)).toEqual([]);
    clock.advance({ days: 30 });

    await identity.inviteStaff(admin.actor, { email: "lokasi@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: OTHER });
    const again = await logIn(setup, "lokasi@contoh.id");

    expect(await identity.actorFromCookies(again.cookies)).toMatchObject({ roles: ["pemesan", "admin_lokasi"], lokasiIds: [OTHER] });
    expect(await identity.adminLokasiOf(LOKASI)).toEqual([]);
  });

  it("a Dinonaktifkan Admin Platform invited back must enrol a new authenticator: deactivation clears its TOTP", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const admin = await signedInAdminPlatform(setup);
    await identity.inviteStaff(admin.actor, { email: "dua@makam.co.id", phoneNumber: "082222222222", role: "admin_platform" });
    const second = await logIn(setup, "dua@makam.co.id");
    const enrolment = await identity.startTotpEnrolment(await actorOf(identity, second.cookies));
    if (!enrolment.ok) throw new Error(enrolment.reason);
    expect(await identity.passTotp(await actorOf(identity, second.cookies), authenticatorCode(enrolment.secret, clock.now()))).toEqual({ ok: true });

    await identity.deactivateStaff(admin.actor, { accountId: second.login.account.id, reason: "Cuti panjang" });
    clock.advance({ days: 1 });
    await identity.inviteStaff(admin.actor, { email: "dua@makam.co.id", phoneNumber: "082222222222", role: "admin_platform" });
    const back = await logIn(setup, "dua@makam.co.id");

    expect(await identity.actorFromCookies(back.cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform"],
      totp: "perlu_daftar",
    });
  });
});

describe("Admin Lokasi of a Lokasi Mitra continuously since a time", () => {
  async function adminLokasiInvitedAndLoggedIn(
    setup: ReturnType<typeof identityOnTestDatabase>,
    admin: Awaited<ReturnType<typeof signedInAdminPlatform>>,
  ) {
    await setup.identity.inviteStaff(admin.actor, { email: "lokasi@contoh.id", phoneNumber: "082222222222", role: "admin_lokasi", lokasiId: LOKASI });
    return (await logIn(setup, "lokasi@contoh.id", { phoneNumber: "082222222222" })).login.account.id;
  }

  it("is the Akun when it has been Admin Lokasi of the Lokasi since then, and null when it became one later", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const beforeLink = setup.clock.now();
    setup.clock.advance({ minutes: 1 });
    const accountId = await adminLokasiInvitedAndLoggedIn(setup, admin);
    setup.clock.advance({ minutes: 1 });

    expect(await setup.identity.adminLokasiSince(accountId, LOKASI, setup.clock.now())).toEqual({
      accountId,
      email: "lokasi@contoh.id",
      phoneNumber: "+6282222222222",
    });
    expect(await setup.identity.adminLokasiSince(accountId, LOKASI, beforeLink)).toBeNull();
    expect(await setup.identity.adminLokasiSince(accountId, "5d1f4c2e-0000-4000-8000-000000000002", setup.clock.now())).toBeNull();
  });

  it("is null once the Akun was removed from the Lokasi, even when invited back since", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const accountId = await adminLokasiInvitedAndLoggedIn(setup, admin);
    const since = setup.clock.now();
    setup.clock.advance({ minutes: 1 });
    await setup.identity.removeAdminLokasi(admin.actor, { lokasiId: LOKASI, accountId, reason: "Salah Lokasi" });
    expect(await setup.identity.adminLokasiSince(accountId, LOKASI, since)).toBeNull();
    setup.clock.advance({ minutes: 1 });

    await adminLokasiInvitedAndLoggedIn(setup, admin);

    expect(await setup.identity.adminLokasiSince(accountId, LOKASI, since)).toBeNull();
  });

  it("is null once the Akun was Dinonaktifkan", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const accountId = await adminLokasiInvitedAndLoggedIn(setup, admin);
    const since = setup.clock.now();

    await setup.identity.deactivateStaff(admin.actor, { accountId, reason: "Keluar" });

    expect(await setup.identity.adminLokasiSince(accountId, LOKASI, since)).toBeNull();
  });
});

describe("reads are not audited", () => {
  it("reading the Akun Staf, the open Undangan Staf and an entity's Entri Audit records nothing", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(actor, { email: "dua@contoh.id", phoneNumber: "082222222222", role: "mitra_jasa" });
    const before = await setup.audit.allEntries();
    expect(before.length).toBeGreaterThan(0);

    await setup.identity.staffAccounts();
    await setup.identity.openStaffInvites();
    await setup.audit.entriesAbout({ kind: "akun", id: actor.accountId });
    await setup.identity.actorFromCookies(null);

    expect(await setup.audit.allEntries()).toEqual(before);
  });
});
