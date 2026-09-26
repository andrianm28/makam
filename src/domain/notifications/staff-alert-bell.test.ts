import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { signedInAdminPlatform } from "../../../tests/support/identity";
import { invitedStaff, notificationsOnTestDatabase, signedInStaff } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Peringatan Staf about work at a Lokasi Mitra, as a later slice will raise it. */
function peringatan(title: string, url = "/staf/admin-lokasi") {
  return {
    whatsapp: { template: "staf_saat_duka_baru", parameters: ["Taman Makam Contoh", "MKM-2026-000123"] },
    push: { title, body: "MKM-2026-000123 di Taman Makam Contoh", url },
  };
}

describe("the Peringatan Staf bell", () => {
  it("lists the signed-in Akun Staf's Peringatan Staf, newest first, each with the staff page of its subject, all unread", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, clock } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");

    await notifications.sendStaffAlert({ to: { accountId: adminLokasi.accountId }, ...peringatan("Pemesanan Saat Duka baru") });
    clock.advance({ minutes: 5 });
    await notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...peringatan("Jadwal Pemakaman berubah", "/staf/admin-lokasi/5d1f4c2e-0000-4000-8000-000000000001"),
    });

    const bell = await notifications.staffAlerts(adminLokasi);
    expect(bell).toMatchObject({
      ok: true,
      unread: 2,
      latest: [
        {
          title: "Jadwal Pemakaman berubah",
          body: "MKM-2026-000123 di Taman Makam Contoh",
          url: "/staf/admin-lokasi/5d1f4c2e-0000-4000-8000-000000000001",
          read: false,
        },
        { title: "Pemesanan Saat Duka baru", url: "/staf/admin-lokasi", read: false },
      ],
    });
    if (!bell.ok) throw new Error(bell.reason);
    expect(bell.latest[0].sentAt.getTime() - bell.latest[1].sentAt.getTime()).toBe(5 * 60_000);
  });

  it("opening the bell marks every Peringatan Staf read; one that arrives afterwards is unread again", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, clock } = setup;
    const petugas = await signedInStaff(setup, "petugas_lapangan");
    await notifications.sendStaffAlert({ to: { accountId: petugas.accountId }, ...peringatan("Tugas Lapangan baru", "/staf/petugas-lapangan") });
    clock.advance({ minutes: 1 });
    await notifications.sendStaffAlert({ to: { accountId: petugas.accountId }, ...peringatan("Tugas Lapangan diubah", "/staf/petugas-lapangan") });

    expect(await notifications.markStaffAlertsRead(petugas)).toEqual({ ok: true });
    expect(await notifications.staffAlerts(petugas)).toMatchObject({
      unread: 0,
      latest: [{ read: true }, { read: true }],
    });

    clock.advance({ minutes: 1 });
    await notifications.sendStaffAlert({ to: { accountId: petugas.accountId }, ...peringatan("Tugas Lapangan dibatalkan", "/staf/petugas-lapangan") });
    expect(await notifications.staffAlerts(petugas)).toMatchObject({
      unread: 1,
      latest: [{ title: "Tugas Lapangan dibatalkan", read: false }, { read: true }, { read: true }],
    });
  });

  it("shows only the latest few, while counting every unread one", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, clock } = setup;
    const petugas = await signedInStaff(setup, "petugas_lapangan");
    for (let n = 1; n <= 12; n++) {
      await notifications.sendStaffAlert({ to: { accountId: petugas.accountId }, ...peringatan(`Tugas Lapangan ${n}`, "/staf/petugas-lapangan") });
      clock.advance({ minutes: 1 });
    }

    const bell = await notifications.staffAlerts(petugas, { limit: 3 });
    expect(bell).toMatchObject({
      unread: 12,
      latest: [{ title: "Tugas Lapangan 12" }, { title: "Tugas Lapangan 11" }, { title: "Tugas Lapangan 10" }],
    });
  });

  it("is empty for an Akun Staf with no Peringatan Staf, and never shows another Akun's", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    const petugas = await invitedStaff(setup, admin, "petugas_lapangan", "083333333333");
    await notifications.sendStaffAlert({ to: { accountId: adminLokasi.accountId }, ...peringatan("Pemesanan Saat Duka baru") });

    expect(await notifications.staffAlerts(petugas)).toEqual({ ok: true, unread: 0, latest: [] });
    await notifications.markStaffAlertsRead(petugas);
    expect(await notifications.staffAlerts(adminLokasi)).toMatchObject({ unread: 1 });
  });

  it("is refused to an Akun without a staff role, and to an Admin Platform before the TOTP step", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    await notifications.sendStaffAlert({ to: { accountId: adminLokasi.accountId }, ...peringatan("Pemesanan Saat Duka baru") });
    await identity.deactivateStaff(admin, { accountId: adminLokasi.accountId, reason: "Keluar dari Operator" });
    const pemesan = { ...adminLokasi, roles: ["pemesan" as const], lokasiIds: [] };

    expect(await notifications.staffAlerts(pemesan)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await notifications.markStaffAlertsRead(pemesan)).toEqual({ ok: false, reason: "tidak_berwenang" });
    const beforeTotp = { ...admin, totp: "perlu_verifikasi" as const };
    expect(await notifications.staffAlerts(beforeTotp)).toEqual({ ok: false, reason: "perlu_totp" });
  });

  it("records nothing for an Akun that no longer holds a staff role", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await invitedStaff(setup, admin, "petugas_lapangan", "083333333333");
    await identity.deactivateStaff(admin, { accountId: petugas.accountId, reason: "Keluar dari Operator" });
    await notifications.sendStaffAlert({ to: { accountId: petugas.accountId }, ...peringatan("Tugas Lapangan baru", "/staf/petugas-lapangan") });

    // Invited again (a minute later, past the OTP resend wait): the bell starts empty.
    setup.clock.advance({ minutes: 1 });
    const again = await invitedStaff(setup, admin, "petugas_lapangan", "083333333333");
    expect(await notifications.staffAlerts(again)).toEqual({ ok: true, unread: 0, latest: [] });
  });
});
