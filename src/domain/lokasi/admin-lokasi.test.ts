import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { logInByOtp } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminPlatform } from "../../../tests/support/lokasi";

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
});
