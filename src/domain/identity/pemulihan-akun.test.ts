import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { FileStore } from "@/ports/file-store";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  akunFromBeforeEmailKey,
  identityOnTestDatabase,
  logIn,
  signedInAdminPlatform,
  type IdentitySetup,
} from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const OLD = "lama@contoh.id";
const NEW = "baru@contoh.id";
/** A photo whose bytes start like a JPEG (FF D8 FF). */
const jpeg = (rest: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(rest)]);
const KTP = { body: jpeg("foto KTP"), contentType: "image/jpeg" };

async function pemesanWhoLostTheirEmail() {
  const setup = identityOnTestDatabase(db);
  const admin = await signedInAdminPlatform(setup);
  const pemesan = await logIn(setup, OLD, { phoneNumber: "085555555555" });
  setup.clock.advance({ minutes: 5 });
  return { ...setup, admin, pemesan };
}

function recover(setup: IdentitySetup, admin: Awaited<ReturnType<typeof signedInAdminPlatform>>, changes: object = {}) {
  return setup.identity.recoverAccount(admin.actor, {
    currentEmail: OLD,
    newEmail: NEW,
    ktpCheck: KTP,
    ktpChecked: true,
    reason: "Email lama tidak bisa dibuka; KTP cocok dengan data pesanan",
    ...changes,
  });
}

describe("Pemulihan Akun", () => {
  it("Pemulihan Akun moves an Akun to a new Email Terverifikasi after a KTP check: the same Akun now logs in with the new email", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const { identity, admin, pemesan } = setup;

    const moved = await recover(setup, admin);

    expect(moved).toMatchObject({
      ok: true,
      account: { id: pemesan.login.account.id, email: NEW, phoneNumber: "+6285555555555" },
    });
    const again = await logIn(setup, NEW);
    expect(again.login).toMatchObject({ accountCreated: false, account: { id: pemesan.login.account.id } });
    expect(await identity.accountByEmail(OLD)).toBeNull();
  });

  it("ends every session of the Akun", async () => {
    const setup = await pemesanWhoLostTheirEmail();

    await recover(setup, setup.admin);

    expect(await setup.identity.actorFromCookies(setup.pemesan.cookies)).toBeNull();
  });

  it("keeps the KTP check in the private FileStore and audits the move with its reason, the old and new email and the file", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const { files, audit, admin, pemesan } = setup;

    const moved = await recover(setup, admin, { reason: "Email lama hilang; KTP cocok" });
    if (!moved.ok) throw new Error(moved.reason);

    expect(files.stored.get(moved.ktpCheckFileKey)).toMatchObject({ contentType: "image/jpeg", body: KTP.body });
    expect(await audit.entriesAbout({ kind: "akun", id: pemesan.login.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:05"),
        actor: { accountId: admin.actor.accountId, role: "admin_platform" },
        action: "akun.pemulihan",
        before: { email: OLD, terverifikasi: true },
        after: { email: NEW, terverifikasi: true, ktpCheckFileKey: moved.ktpCheckFileKey },
        reason: "Email lama hilang; KTP cocok",
      }),
    ]);
  });

  it("keeps the Akun's history: its roles, phone number and every earlier Entri Audit stay with the Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const invited = await setup.identity.inviteStaff(admin.actor, { email: OLD, phoneNumber: "085555555555", role: "petugas_lapangan" });
    if (!invited.ok) throw new Error(invited.reason);
    const staff = await logIn(setup, OLD);
    await recover(setup, admin);
    await recover(setup, admin, { currentEmail: NEW, newEmail: "ketiga@contoh.id" });

    expect(await setup.identity.staffAccounts()).toContainEqual({
      accountId: staff.login.account.id,
      email: "ketiga@contoh.id",
      emailTerverifikasi: true,
      phoneNumber: "+6285555555555",
      roles: ["petugas_lapangan"],
      deactivated: false,
    });
    expect(await setup.audit.entriesAbout({ kind: "undangan_staf", id: invited.invite.id })).toHaveLength(1);
    expect(
      (await setup.audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).map((entry) => [entry.action, entry.after?.email]),
    ).toEqual([
      ["staf.peran_diberikan", undefined],
      ["akun.pemulihan", NEW],
      ["akun.pemulihan", "ketiga@contoh.id"],
    ]);
  });

  it("is refused without a confirmed KTP check, a file, a reason, or when the new email is another Akun's key", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const { identity, admin, pemesan } = setup;
    const other = await logIn(setup, "lain@contoh.id");

    expect(await recover(setup, admin, { ktpChecked: false })).toEqual({ ok: false, reason: "ktp_belum_dicek" });
    expect(await recover(setup, admin, { ktpCheck: { body: new Uint8Array(), contentType: "image/jpeg" } })).toEqual({
      ok: false,
      reason: "berkas_ktp_wajib",
    });
    expect(await recover(setup, admin, { ktpCheck: { body: KTP.body, contentType: "text/html" } })).toEqual({
      ok: false,
      reason: "berkas_ktp_tidak_didukung",
    });
    expect(await recover(setup, admin, { reason: "  " })).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await recover(setup, admin, { newEmail: "LAIN@contoh.id" })).toEqual({ ok: false, reason: "email_sudah_dipakai" });
    expect(await recover(setup, admin, { newEmail: OLD })).toEqual({ ok: false, reason: "email_sama" });
    expect(await recover(setup, admin, { newEmail: "bukan-email" })).toEqual({ ok: false, reason: "email_tidak_valid" });
    expect(await recover(setup, admin, { currentEmail: "tidak.ada@contoh.id" })).toEqual({
      ok: false,
      reason: "akun_tidak_ditemukan",
    });
    expect(await identity.accountByEmail(OLD)).toMatchObject({ id: pemesan.login.account.id });
    expect(await identity.accountByEmail("lain@contoh.id")).toMatchObject({ id: other.login.account.id });
  });

  it("a KTP check whose bytes are not the declared JPEG, PNG or PDF is refused", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const text = new TextEncoder().encode("<html>bukan KTP</html>");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    for (const ktpCheck of [
      { body: text, contentType: "image/jpeg" },
      { body: png, contentType: "image/jpeg" },
      { body: jpeg("x"), contentType: "application/pdf" },
    ]) {
      expect(await recover(setup, setup.admin, { ktpCheck })).toEqual({ ok: false, reason: "berkas_ktp_tidak_didukung" });
    }
    expect(setup.files.stored.size).toBe(0);
    expect(await setup.identity.accountByEmail(OLD)).not.toBeNull();
  });

  it.each([
    ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
    ["application/pdf", new TextEncoder().encode("%PDF-1.7 scan KTP")],
  ])("a KTP check that really is %s is accepted", async (contentType, body) => {
    const setup = await pemesanWhoLostTheirEmail();

    expect(await recover(setup, setup.admin, { ktpCheck: { body, contentType } })).toMatchObject({ ok: true });
  });

  it("an Admin Platform cannot recover their own Akun", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const { identity, files, admin } = setup;

    expect(await recover(setup, admin, { currentEmail: "admin@makam.co.id" })).toEqual({ ok: false, reason: "akun_sendiri" });
    expect(await identity.accountByEmail("admin@makam.co.id")).toMatchObject({ id: admin.actor.accountId });
    expect(await identity.actorFromCookies(admin.cookies)).not.toBeNull();
    expect(files.stored.size).toBe(0);
  });

  it("only an Admin Platform past TOTP may do a Pemulihan Akun", async () => {
    const setup = await pemesanWhoLostTheirEmail();
    const notAdmin = await setup.identity.actorFromCookies(setup.pemesan.cookies);
    if (!notAdmin) throw new Error("not signed in");

    expect(
      await setup.identity.recoverAccount(notAdmin, {
        currentEmail: OLD,
        newEmail: NEW,
        ktpCheck: KTP,
        ktpChecked: true,
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("when the FileStore refuses the KTP check (no S3 yet on staging), nothing moves and nothing is audited", async () => {
    const refusing: FileStore = {
      put: async () => {
        throw new Error("FileStore (S3) has no live adapter configured");
      },
      signedUrl: async () => "",
      delete: async () => undefined,
    };
    const setup = identityOnTestDatabase(db, { files: refusing });
    const admin = await signedInAdminPlatform(setup);
    const pemesan = await logIn(setup, OLD);

    expect(await recover(setup, admin)).toEqual({ ok: false, reason: "berkas_gagal_disimpan" });
    expect(await setup.identity.accountByEmail(OLD)).toMatchObject({ id: pemesan.login.account.id });
    expect(await setup.audit.entriesAbout({ kind: "akun", id: pemesan.login.account.id })).toEqual([]);
  });
});

describe("an Akun from before ADR 0004 without an Email Terverifikasi", () => {
  it("cannot log in until an Admin Platform does a Pemulihan Akun, which gives it an Email Terverifikasi", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const legacy = await akunFromBeforeEmailKey(db, { email: "staf.lama@contoh.id", phoneNumber: "+6282222222222" });
    expect(await setup.identity.actorFromCookies(legacy.cookies)).toBeNull();

    const moved = await recover(setup, admin, { currentEmail: "Staf.Lama@contoh.id", newEmail: "staf.lama@contoh.id" });

    expect(moved).toMatchObject({ ok: true, account: { id: legacy.accountId, email: "staf.lama@contoh.id" } });
    expect((await logIn(setup, "staf.lama@contoh.id")).login).toMatchObject({
      accountCreated: false,
      account: { id: legacy.accountId, phoneNumber: "+6282222222222" },
    });
  });

  it("the email only typed in on it is no key: a Kode Masuk to it makes a new Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const legacy = await akunFromBeforeEmailKey(db, { email: "pemesan.lama@contoh.id", phoneNumber: "+6283333333333" });

    const login = await logIn(setup, "pemesan.lama@contoh.id");

    expect(login.login).toMatchObject({ accountCreated: true, account: { phoneNumber: null } });
    expect(login.login.account.id).not.toBe(legacy.accountId);
  });
});
