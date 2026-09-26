import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createLokasi } from "@/domain/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";
import {
  browserPushSubscription,
  loggedInOnAnotherBrowser,
  notificationsOnTestDatabase,
} from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The Lokasi and Notifications modules side by side on the test Postgres, over one identity module. */
function lokasiAndNotificationsOnTestDatabase() {
  const setup = notificationsOnTestDatabase(db);
  const lokasi = createLokasi({ db, clock: setup.clock, files: setup.files, audit: setup.audit, identity: setup.identity });
  return { ...setup, lokasi };
}

describe("an Admin Lokasi Dinonaktifkan, with Perangkat Push (ticket 21)", () => {
  it("loses every session and every Perangkat Push, leaves its Lokasi Mitra, and each of its Lokasi's Audit Log records it", async () => {
    const setup = lokasiAndNotificationsOnTestDatabase();
    const { identity, lokasi, notifications, webPush } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const first = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const second = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const leaving = await signedInAdminLokasi(setup, admin, [first.id, second.id], "083333333333");
    const diLaptop = await loggedInOnAnotherBrowser(setup, "lokasi@contoh.id");
    await notifications.enablePush(leaving, { subscription: browserPushSubscription() });
    await notifications.enablePush(diLaptop.actor, { subscription: browserPushSubscription() });
    const staying = await signedInAdminLokasi(setup, admin, [first.id, second.id], "084444444444");

    expect(await identity.deactivateStaff(admin, { accountId: leaving.accountId, reason: "Berhenti bekerja" })).toEqual({
      ok: true,
    });

    expect(await identity.actorFromCookies(diLaptop.cookies)).toBeNull();
    expect(await notifications.pushDevices(leaving.accountId)).toEqual([]);
    await notifications.sendStaffAlert({
      to: { accountId: leaving.accountId },
      kind: "staf_saat_duka_baru",
      email: { subject: "Pemesanan Saat Duka baru", text: "MKM-2026-000123 di Makam Wakaf Al-Ikhlas menunggu konfirmasi." },
      push: { title: "Pemesanan Saat Duka baru", body: "MKM-2026-000123 menunggu konfirmasi", url: "/staf/admin-lokasi" },
    });
    expect(webPush.sent).toEqual([]);
    for (const lokasiMitra of [first, second]) {
      const admins = await lokasi.adminLokasiOf(admin, lokasiMitra.id);
      if (!admins.ok) throw new Error(admins.reason);
      expect(admins.adminLokasi.map((account) => account.accountId)).toEqual([staying.accountId]);
      const log = await lokasi.auditLog(staying, lokasiMitra.id);
      if (!log.ok) throw new Error(log.reason);
      expect(log.entries.filter((entry) => entry.action === "staf.nonaktifkan")).toEqual([
        expect.objectContaining({ entity: { kind: "akun", id: leaving.accountId }, lokasiId: lokasiMitra.id }),
      ]);
    }
  });
});

describe("an Admin Lokasi invite accepted at a Kode Masuk", () => {
  it("makes a Pemesan with that Email Terverifikasi Admin Lokasi of each Lokasi Mitra it was invited to", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { identity, lokasi, clock } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const first = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const second = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const pemesan = await logIn(setup, "sari@contoh.id");
    for (const lokasiMitra of [first, second]) {
      const invited = await lokasi.inviteAdminLokasi(admin, lokasiMitra.id, {
        email: "Sari@contoh.id",
        phoneNumber: "083333333333",
      });
      expect(invited.ok).toBe(true);
    }

    clock.advance({ minutes: 1 });
    const adminLokasi = await actorOf(identity, (await logIn(setup, "sari@contoh.id")).cookies);
    expect(adminLokasi.accountId).toBe(pemesan.login.account.id);

    expect(adminLokasi.roles).toEqual(["pemesan", "admin_lokasi"]);
    expect((await lokasi.lokasiMitraOfAdminLokasi(adminLokasi)).map((summary) => summary.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    for (const lokasiMitra of [first, second]) {
      expect(await lokasi.lokasiMitra(adminLokasi, lokasiMitra.id)).toMatchObject({ ok: true });
      const log = await lokasi.auditLog(adminLokasi, lokasiMitra.id);
      if (!log.ok) throw new Error(log.reason);
      expect(log.entries.filter((entry) => entry.action === "staf.peran_diberikan")).toEqual([
        expect.objectContaining({ entity: { kind: "akun", id: adminLokasi.accountId }, lokasiId: lokasiMitra.id }),
      ]);
    }
    expect(adminLokasi.email).toBe("sari@contoh.id");
  });
});
