import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { logInByOtp } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { authorize, lokasiMitraResource } from "@/domain/identity";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const INVITEE = "083333333333";

describe("Admin Lokasi of a Lokasi Mitra", () => {
  it("Admin Platform invites an Admin Lokasi to a Lokasi Mitra by WhatsApp number and email; after the OTP login the Akun is Admin Lokasi there", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const invited = await setup.lokasi.inviteAdminLokasi(admin, lokasiMitra.id, {
      phoneNumber: "0833-3333-3333",
      email: "Pengelola@Contoh.id",
    });

    expect(invited).toMatchObject({
      ok: true,
      invite: { phoneNumber: "+6283333333333", email: "pengelola@contoh.id", role: "admin_lokasi", lokasiId: lokasiMitra.id },
    });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, INVITEE);
    const adminLokasi = await setup.identity.actorFromCookies(cookies);
    expect(adminLokasi).toMatchObject({ roles: ["pemesan", "admin_lokasi"], lokasiIds: [lokasiMitra.id] });
    expect(await setup.lokasi.adminLokasiOf(admin, lokasiMitra.id)).toEqual({
      ok: true,
      adminLokasi: [{ accountId: adminLokasi!.accountId, phoneNumber: "+6283333333333", email: "pengelola@contoh.id" }],
      openInvites: [],
    });
  });

  it("an Admin Lokasi sees its own Lokasi Mitra and cannot read another Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);

    expect(await setup.lokasi.lokasiMitra(adminLokasi, own.id)).toMatchObject({ ok: true, lokasiMitra: { name: own.name } });
    expect(await setup.lokasi.lokasiMitra(adminLokasi, other.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.adminLokasiOf(adminLokasi, other.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("an Admin Lokasi's view of its Lokasi Mitra holds no bank account; Admin Platform's does", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const bankAccount = { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Yayasan Al-Ikhlas" };
    await setup.lokasi.changeBankAccount(admin, lokasiMitra.id, { ...bankAccount, reason: null });
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    const forAdminLokasi = await setup.lokasi.lokasiMitra(adminLokasi, lokasiMitra.id);
    const forAdmin = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);

    if (!forAdminLokasi.ok) throw new Error(forAdminLokasi.reason);
    expect(forAdminLokasi.lokasiMitra).not.toHaveProperty("bankAccount");
    expect(JSON.stringify(forAdminLokasi)).not.toContain("7123456789");
    expect(forAdmin).toMatchObject({ ok: true, lokasiMitra: { bankAccount } });
  });

  it("an Admin Lokasi of several Lokasi Mitra gets exactly those for the Lokasi switcher, by name; Admin Platform gets every Lokasi Mitra", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const first = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const unrelated = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const second = await newLokasiMitra(setup, admin, "Makam Yayasan Bumi Damai");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [first.id, second.id]);

    expect(await setup.lokasi.lokasiMitraOfAdminLokasi(adminLokasi)).toEqual([
      { id: first.id, name: "Makam Wakaf Al-Ikhlas", city: "Kota Jakarta Timur", status: "belum_tayang" },
      { id: second.id, name: "Makam Yayasan Bumi Damai", city: "Kota Jakarta Timur", status: "belum_tayang" },
    ]);
    expect((await setup.lokasi.allLokasiMitra(admin)).map((lokasi) => lokasi.name)).toEqual([
      "Makam Keluarga Sentosa",
      "Makam Wakaf Al-Ikhlas",
      "Makam Yayasan Bumi Damai",
    ]);
    expect(unrelated.name).toBe("Makam Keluarga Sentosa");
    expect(await setup.lokasi.allLokasiMitra(adminLokasi)).toEqual([]);
  });

  it("only Admin Platform changes the bank account: an Admin Lokasi's attempt is rejected by the authorisation check, nothing changes and nothing is audited", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const entriesBefore = await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id });

    expect(authorize(adminLokasi, "lokasi.ubah_rekening", lokasiMitraResource(lokasiMitra.id))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(
      await setup.lokasi.changeBankAccount(adminLokasi, lokasiMitra.id, {
        bankName: "BRI",
        accountNumber: "1111111111",
        accountHolder: "Rekening Lain",
        reason: null,
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({ lokasiMitra: { bankAccount: null } });
    expect(await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id })).toEqual(entriesBefore);
  });

  it("only Admin Platform changes which Admin Lokasi a Lokasi Mitra has: an Admin Lokasi's invite or removal is rejected by the authorisation check", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(authorize(adminLokasi, "lokasi.atur_admin_lokasi", lokasiMitraResource(lokasiMitra.id))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(
      await setup.lokasi.inviteAdminLokasi(adminLokasi, lokasiMitra.id, { phoneNumber: "084444444444", email: "teman@contoh.id" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.lokasi.removeAdminLokasi(adminLokasi, lokasiMitra.id, { accountId: adminLokasi.accountId, reason: "uji" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.adminLokasiOf(admin, lokasiMitra.id)).toMatchObject({
      adminLokasi: [{ accountId: adminLokasi.accountId }],
      openInvites: [],
    });
  });

  it("Admin Platform removes an Admin Lokasi from one Lokasi Mitra, audited: the Akun keeps its other Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const kept = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const removed = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [kept.id, removed.id]);

    expect(
      await setup.lokasi.removeAdminLokasi(admin, removed.id, { accountId: adminLokasi.accountId, reason: "Pindah tugas" }),
    ).toEqual({ ok: true });

    const after = await setup.identity.accountByPhoneNumber("083333333333");
    setup.clock.advance({ minutes: 2 });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, "083333333333");
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ accountId: after!.id, lokasiIds: [kept.id] });
    expect(await setup.lokasi.adminLokasiOf(admin, removed.id)).toMatchObject({ adminLokasi: [] });
    expect(await setup.audit.entriesAbout({ kind: "akun", id: adminLokasi.accountId })).toContainEqual(
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "staf.lepas_admin_lokasi",
        // Both invites were accepted on one login: the two Lokasi carry no order between them.
        before: { lokasiIds: expect.toSatisfy((ids: string[]) => ids.length === 2 && ids.includes(kept.id) && ids.includes(removed.id)) },
        after: { lokasiIds: [kept.id] },
        reason: "Pindah tugas",
      }),
    );
    expect(
      await setup.lokasi.removeAdminLokasi(admin, removed.id, { accountId: adminLokasi.accountId, reason: "Lagi" }),
    ).toEqual({ ok: false, reason: "bukan_admin_lokasi_di_sini" });
  });

  it("an invite to a Lokasi Mitra that does not exist is refused", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    for (const lokasiId of ["5d1f4c2e-0000-4000-8000-00000000abcd", "bukan-lokasi"]) {
      expect(
        await setup.lokasi.inviteAdminLokasi(admin, lokasiId, { phoneNumber: INVITEE, email: "lokasi@contoh.id" }),
      ).toEqual({ ok: false, reason: "tidak_ditemukan" });
    }
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });
});
