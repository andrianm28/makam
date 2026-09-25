import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { FileStore } from "@/ports/file-store";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { identityOnTestDatabase, logInByOtp, signedInAdminPlatform } from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const OLD = "085555555555";
const NEW = "086666666666";
/** A photo whose bytes start like a JPEG (FF D8 FF). */
const jpeg = (rest: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(rest)]);
const KTP = { body: jpeg("foto KTP"), contentType: "image/jpeg" };

async function pemesanWhoLostTheirPhone() {
  const setup = identityOnTestDatabase(db);
  const admin = await signedInAdminPlatform(setup);
  const pemesan = await logInByOtp(setup.identity, setup.whatsapp, OLD);
  setup.clock.advance({ minutes: 5 });
  return { ...setup, admin, pemesan };
}

describe("Pindah Nomor", () => {
  it("moves a Pemesan's Akun to a new WhatsApp number after a KTP check: the same Akun now logs in with the new number", async () => {
    const { identity, whatsapp, admin, pemesan } = await pemesanWhoLostTheirPhone();

    const moved = await identity.moveAccountToNewNumber(admin.actor, {
      currentPhoneNumber: OLD,
      newPhoneNumber: NEW,
      ktpCheck: KTP,
      ktpChecked: true,
      reason: "HP hilang; KTP cocok dengan data pesanan",
    });

    expect(moved).toMatchObject({ ok: true, account: { id: pemesan.login.account.id, phoneNumber: "+6286666666666" } });
    const again = await logInByOtp(identity, whatsapp, NEW);
    expect(again.login).toMatchObject({ accountCreated: false, account: { id: pemesan.login.account.id } });
    expect(await identity.accountByPhoneNumber(OLD)).toBeNull();
  });

  it("ends the sessions signed in on the old number", async () => {
    const { identity, admin, pemesan } = await pemesanWhoLostTheirPhone();

    await identity.moveAccountToNewNumber(admin.actor, {
      currentPhoneNumber: OLD,
      newPhoneNumber: NEW,
      ktpCheck: KTP,
      ktpChecked: true,
      reason: "HP hilang",
    });

    expect(await identity.actorFromCookies(pemesan.cookies)).toBeNull();
  });

  it("keeps the KTP check in the private FileStore and audits the move with its reason, the old and new number and the file", async () => {
    const { identity, files, audit, admin, pemesan } = await pemesanWhoLostTheirPhone();

    const moved = await identity.moveAccountToNewNumber(admin.actor, {
      currentPhoneNumber: OLD,
      newPhoneNumber: NEW,
      ktpCheck: KTP,
      ktpChecked: true,
      reason: "HP hilang; KTP cocok",
    });
    if (!moved.ok) throw new Error(moved.reason);

    expect(files.stored.get(moved.ktpCheckFileKey)).toMatchObject({ contentType: "image/jpeg", body: KTP.body });
    expect(await audit.entriesAbout({ kind: "akun", id: pemesan.login.account.id })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:05"),
        actor: { accountId: admin.actor.accountId, role: "admin_platform" },
        action: "akun.pindah_nomor",
        before: { phoneNumber: "+6285555555555" },
        after: { phoneNumber: "+6286666666666", ktpCheckFileKey: moved.ktpCheckFileKey },
        reason: "HP hilang; KTP cocok",
      }),
    ]);
  });

  it("keeps the Akun's history: its roles, email and every earlier Entri Audit stay with the Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);
    const invited = await setup.identity.inviteStaff(admin.actor, {
      phoneNumber: OLD,
      email: "pl@contoh.id",
      role: "petugas_lapangan",
    });
    if (!invited.ok) throw new Error(invited.reason);
    const staff = await logInByOtp(setup.identity, setup.whatsapp, OLD);
    const move = (from: string, to: string) =>
      setup.identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: from,
        newPhoneNumber: to,
        ktpCheck: KTP,
        ktpChecked: true,
        reason: "ganti nomor",
      });

    await move(OLD, NEW);
    await move(NEW, "087777777777");

    expect(await setup.identity.staffAccounts()).toContainEqual({
      accountId: staff.login.account.id,
      phoneNumber: "+6287777777777",
      email: "pl@contoh.id",
      roles: ["petugas_lapangan"],
      deactivated: false,
    });
    expect(await setup.audit.entriesAbout({ kind: "undangan_staf", id: invited.invite.id })).toHaveLength(1);
    expect(
      (await setup.audit.entriesAbout({ kind: "akun", id: staff.login.account.id })).map((entry) => [
        entry.action,
        entry.after?.phoneNumber,
      ]),
    ).toEqual([
      ["staf.peran_diberikan", undefined],
      ["akun.pindah_nomor", "+6286666666666"],
      ["akun.pindah_nomor", "+6287777777777"],
    ]);
  });

  it("is refused without a confirmed KTP check, a file, a reason, or when the new number already has an Akun", async () => {
    const { identity, whatsapp, admin } = await pemesanWhoLostTheirPhone();
    await logInByOtp(identity, whatsapp, "087777777777");
    const move = (changes: object) =>
      identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: OLD,
        newPhoneNumber: NEW,
        ktpCheck: KTP,
        ktpChecked: true,
        reason: "HP hilang",
        ...changes,
      });

    expect(await move({ ktpChecked: false })).toEqual({ ok: false, reason: "ktp_belum_dicek" });
    expect(await move({ ktpCheck: { body: new Uint8Array(), contentType: "image/jpeg" } })).toEqual({
      ok: false,
      reason: "berkas_ktp_wajib",
    });
    expect(await move({ ktpCheck: { body: KTP.body, contentType: "text/html" } })).toEqual({
      ok: false,
      reason: "berkas_ktp_tidak_didukung",
    });
    expect(await move({ reason: "  " })).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await move({ newPhoneNumber: "087777777777" })).toEqual({ ok: false, reason: "nomor_sudah_dipakai" });
    expect(await move({ newPhoneNumber: OLD })).toEqual({ ok: false, reason: "nomor_sama" });
    expect(await move({ currentPhoneNumber: "089999999999" })).toEqual({ ok: false, reason: "akun_tidak_ditemukan" });
    expect(await identity.accountByPhoneNumber(OLD)).not.toBeNull();
  });

  it("a KTP check whose bytes are not the declared JPEG, PNG or PDF is refused", async () => {
    const { identity, files, admin } = await pemesanWhoLostTheirPhone();
    const move = (ktpCheck: { body: Uint8Array; contentType: string }) =>
      identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: OLD,
        newPhoneNumber: NEW,
        ktpCheck,
        ktpChecked: true,
        reason: "HP hilang",
      });
    const text = new TextEncoder().encode("<html>bukan KTP</html>");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    expect(await move({ body: text, contentType: "image/jpeg" })).toEqual({ ok: false, reason: "berkas_ktp_tidak_didukung" });
    expect(await move({ body: png, contentType: "image/jpeg" })).toEqual({ ok: false, reason: "berkas_ktp_tidak_didukung" });
    expect(await move({ body: jpeg("x"), contentType: "application/pdf" })).toEqual({
      ok: false,
      reason: "berkas_ktp_tidak_didukung",
    });
    expect(files.stored.size).toBe(0);
    expect(await identity.accountByPhoneNumber(OLD)).not.toBeNull();
  });

  it.each([
    ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
    ["application/pdf", new TextEncoder().encode("%PDF-1.7 scan KTP")],
  ])("a KTP check that really is %s is accepted", async (contentType, body) => {
    const { identity, admin } = await pemesanWhoLostTheirPhone();

    expect(
      await identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: OLD,
        newPhoneNumber: NEW,
        ktpCheck: { body, contentType },
        ktpChecked: true,
        reason: "HP hilang",
      }),
    ).toMatchObject({ ok: true });
  });

  it("an Admin Platform cannot move their own Akun to a new number", async () => {
    const { identity, files, admin } = await pemesanWhoLostTheirPhone();

    expect(
      await identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: "081111111111",
        newPhoneNumber: NEW,
        ktpCheck: KTP,
        ktpChecked: true,
        reason: "Ganti HP",
      }),
    ).toEqual({ ok: false, reason: "akun_sendiri" });
    expect(await identity.accountByPhoneNumber("081111111111")).toMatchObject({ id: admin.actor.accountId });
    expect(await identity.actorFromCookies(admin.cookies)).not.toBeNull();
    expect(files.stored.size).toBe(0);
  });

  it("only an Admin Platform past TOTP may move a number", async () => {
    const { identity, pemesan } = await pemesanWhoLostTheirPhone();
    const notAdmin = await identity.actorFromCookies(pemesan.cookies);
    if (!notAdmin) throw new Error("not signed in");

    expect(
      await identity.moveAccountToNewNumber(notAdmin, {
        currentPhoneNumber: OLD,
        newPhoneNumber: NEW,
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
    const { identity, whatsapp, audit } = setup;
    const admin = await signedInAdminPlatform(setup);
    const pemesan = await logInByOtp(identity, whatsapp, OLD);

    expect(
      await identity.moveAccountToNewNumber(admin.actor, {
        currentPhoneNumber: OLD,
        newPhoneNumber: NEW,
        ktpCheck: KTP,
        ktpChecked: true,
        reason: "HP hilang",
      }),
    ).toEqual({ ok: false, reason: "berkas_gagal_disimpan" });
    expect(await identity.accountByPhoneNumber(OLD)).toMatchObject({ id: pemesan.login.account.id });
    expect(await audit.entriesAbout({ kind: "akun", id: pemesan.login.account.id })).toEqual([]);
  });
});
