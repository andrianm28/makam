import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logInByOtp, signedInAdminPlatform } from "../../../tests/support/identity";
import {
  browserPushSubscription,
  invitedStaff,
  loggedInOnAnotherBrowser,
  notificationsOnTestDatabase,
  signedInStaff,
} from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A new Saat Duka order at a Lokasi Mitra, as ticket 23 will raise it. */
const saatDukaBaru = {
  whatsapp: {
    template: "staf_saat_duka_baru",
    parameters: ["Taman Makam Contoh", "MKM-2026-000123", "Petak tunggal", "Besok 10:00", "Hari ini 21:00", "Ibu Sari"],
  },
  push: {
    title: "Pemesanan Saat Duka baru",
    body: "MKM-2026-000123 di Taman Makam Contoh menunggu konfirmasi",
    url: "/staf/admin-lokasi",
  },
};

describe("Peringatan Staf", () => {
  it("goes by WhatsApp to the number on the Akun and by push to every Perangkat Push of the Akun Staf", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, whatsapp, webPush } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    const laptop = browserPushSubscription();
    await notifications.enablePush(adminLokasi, { subscription: ponsel });
    await notifications.enablePush(adminLokasi, { subscription: laptop });

    const sent = await notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...saatDukaBaru,
    });

    expect(sent).toEqual({ ok: true, whatsapp: "terkirim", push: { delivered: 2, removed: 0 } });
    expect(whatsapp.sent.filter((message) => message.template === "staf_saat_duka_baru")).toEqual([
      expect.objectContaining({ to: "+6282222222222", language: "id", parameters: saatDukaBaru.whatsapp.parameters }),
    ]);
    expect(webPush.sent).toHaveLength(2);
    expect(webPush.sent).toEqual(
      expect.arrayContaining([
        { subscription: ponsel, notification: saatDukaBaru.push },
        { subscription: laptop, notification: saatDukaBaru.push },
      ]),
    );
  });

  it("push never replaces WhatsApp: an Akun Staf without a Perangkat Push still gets the WhatsApp", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, whatsapp, webPush } = setup;
    const petugas = await signedInStaff(setup, "petugas_lapangan");

    const sent = await notifications.sendStaffAlert({
      to: { accountId: petugas.accountId },
      whatsapp: { template: "staf_tugas_lapangan_baru", parameters: ["Kunjungan Verifikasi", "Taman Makam Contoh", "2 Okt"] },
      push: { title: "Tugas Lapangan baru", body: "Kunjungan Verifikasi, 2 Okt", url: "/staf/petugas-lapangan" },
    });

    expect(sent).toEqual({ ok: true, whatsapp: "terkirim", push: { delivered: 0, removed: 0 } });
    expect(whatsapp.sent.map((message) => message.template)).toContain("staf_tugas_lapangan_baru");
    expect(webPush.sent).toEqual([]);
  });

  it("still goes by push when the WhatsApp send fails, and the failure goes to error monitoring without the number", async () => {
    const kirimDevDown = new Error("kirim.dev unavailable for +6282222222222");
    const failingWhatsApp = {
      sendTemplate: async () => {
        throw kirimDevDown;
      },
      statusOf: async () => null,
      replyText: async () => ({ messageId: "x" }),
    };
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const withFailingWhatsApp = notificationsOnTestDatabase(db, { whatsapp: failingWhatsApp });
    await withFailingWhatsApp.notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });

    const sent = await withFailingWhatsApp.notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...saatDukaBaru,
    });

    expect(sent).toEqual({ ok: true, whatsapp: "gagal", push: { delivered: 1, removed: 0 } });
    expect(withFailingWhatsApp.webPush.sent).toHaveLength(1);
    expect(withFailingWhatsApp.reported).toHaveLength(1);
    const [report] = withFailingWhatsApp.reported;
    expect(report?.error).toBeInstanceOf(Error);
    expect((report?.error as Error).message).not.toMatch(/82222222222/);
    expect(JSON.stringify(report?.context)).not.toMatch(/82222222222/);
    expect(report?.context.tags).toMatchObject({ channel: "whatsapp", template: "staf_saat_duka_baru" });
  });

  it("a push service that fails keeps the Perangkat Push, and the failure goes to error monitoring", async () => {
    const setup = notificationsOnTestDatabase(db, {
      webPush: {
        send: async () => {
          throw new Error("push service timed out");
        },
      },
    });
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    await setup.notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });

    expect(await setup.notifications.sendStaffAlert({ to: { accountId: adminLokasi.accountId }, ...saatDukaBaru })).toEqual({
      ok: true,
      whatsapp: "terkirim",
      push: { delivered: 0, removed: 0 },
    });
    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toHaveLength(1);
    expect(setup.reported).toEqual([
      { error: expect.objectContaining({ message: "push service timed out" }), context: { tags: expect.objectContaining({ channel: "push" }) } },
    ]);
  });

  it("is not sent to an Akun that no longer holds a staff role (Dinonaktifkan): no WhatsApp, no push", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, whatsapp, webPush, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    await notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });
    await identity.deactivateStaff(admin, { accountId: adminLokasi.accountId, reason: "Keluar dari Operator" });
    const sentBefore = whatsapp.sent.length;

    expect(
      await notifications.sendStaffAlert({
        to: { accountId: adminLokasi.accountId },
        ...saatDukaBaru,
      }),
    ).toEqual({ ok: false, reason: "bukan_akun_staf" });
    expect(whatsapp.sent.slice(sentBefore)).toEqual([]);
    expect(webPush.sent).toEqual([]);
  });

  it("opens only a staff page when tapped: a push naming any other place is refused", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");

    for (const url of ["https://contoh.example/staf", "/stafxyz", "/staf/../akun"]) {
      await expect(
        setup.notifications.sendStaffAlert({
          to: { accountId: adminLokasi.accountId },
          ...saatDukaBaru,
          push: { ...saatDukaBaru.push, url },
        }),
      ).rejects.toThrow(/staff page/);
    }
  });
});

describe("Perangkat Push", () => {
  it("is turned off by Keluar: after Keluar, a Peringatan Staf reaches that browser no more", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, webPush, identity } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const { actor: diLaptop, cookies: laptopCookies } = await loggedInOnAnotherBrowser(setup, adminLokasi.phoneNumber);
    const ponsel = browserPushSubscription();
    const laptop = browserPushSubscription();
    await notifications.enablePush(adminLokasi, { subscription: ponsel });
    await notifications.enablePush(diLaptop, { subscription: laptop });

    await identity.endSession(laptopCookies);

    expect(await notifications.pushDevices(adminLokasi.accountId)).toEqual([
      { endpoint: ponsel.endpoint, enabledAt: expect.any(Date) },
    ]);
    await notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...saatDukaBaru,
    });
    expect(webPush.sent.map((push) => push.subscription.endpoint)).toEqual([ponsel.endpoint]);
  });

  it("is turned off when a new role grant ends its session: only the browser that accepted the role keeps push", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await invitedStaff(setup, admin, "petugas_lapangan", "082222222222");
    await notifications.enablePush(petugas, { subscription: browserPushSubscription() });
    const invited = await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "mj@contoh.id", role: "mitra_jasa" });
    expect(invited.ok).toBe(true);

    const { actor: diLaptop } = await loggedInOnAnotherBrowser(setup, petugas.phoneNumber);
    const laptop = browserPushSubscription();
    await notifications.enablePush(diLaptop, { subscription: laptop });

    expect(await notifications.pushDevices(petugas.accountId)).toEqual([
      { endpoint: laptop.endpoint, enabledAt: expect.any(Date) },
    ]);
  });

  it("is removed, every one of them, when the Akun Staf is Dinonaktifkan", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    const { actor: diLaptop } = await loggedInOnAnotherBrowser(setup, adminLokasi.phoneNumber);
    await notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });
    await notifications.enablePush(diLaptop, { subscription: browserPushSubscription() });

    await identity.deactivateStaff(admin, { accountId: adminLokasi.accountId, reason: "Keluar dari Operator" });

    expect(await notifications.pushDevices(adminLokasi.accountId)).toEqual([]);
  });

  it("is removed once its browser reports the subscription gone, and gets no further pushes", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, webPush } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const lama = browserPushSubscription();
    const baru = browserPushSubscription();
    await notifications.enablePush(adminLokasi, { subscription: lama });
    await notifications.enablePush(adminLokasi, { subscription: baru });
    webPush.expireSubscription(lama.endpoint);
    const to = { accountId: adminLokasi.accountId };

    expect(await notifications.sendStaffAlert({ to, ...saatDukaBaru })).toEqual({
      ok: true,
      whatsapp: "terkirim",
      push: { delivered: 1, removed: 1 },
    });
    expect(await notifications.pushDevices(adminLokasi.accountId)).toEqual([
      { endpoint: baru.endpoint, enabledAt: expect.any(Date) },
    ]);

    expect(await notifications.sendStaffAlert({ to, ...saatDukaBaru })).toEqual({
      ok: true,
      whatsapp: "terkirim",
      push: { delivered: 1, removed: 0 },
    });
  });

  it("is one per browser: turning push on again there with new keys keeps a single Perangkat Push, and pushes use the new keys", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    const kunciBaru = { ...browserPushSubscription(), endpoint: ponsel.endpoint };
    await setup.notifications.enablePush(adminLokasi, { subscription: ponsel });

    expect(await setup.notifications.enablePush(adminLokasi, { subscription: kunciBaru })).toEqual({ ok: true });

    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toEqual([
      { endpoint: ponsel.endpoint, enabledAt: expect.any(Date) },
    ]);
    await setup.notifications.sendStaffAlert({ to: { accountId: adminLokasi.accountId }, ...saatDukaBaru });
    expect(setup.webPush.sent.map((push) => push.subscription)).toEqual([kunciBaru]);
  });

  it("moves to the Akun Staf that turns push on in a browser another Akun Staf used before", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    const mitraJasa = await invitedStaff(setup, admin, "mitra_jasa", "083333333333");
    const bersama = browserPushSubscription();
    await setup.notifications.enablePush(adminLokasi, { subscription: bersama });

    await setup.notifications.enablePush(mitraJasa, { subscription: bersama });

    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toEqual([]);
    expect(await setup.notifications.pushDevices(mitraJasa.accountId)).toEqual([
      { endpoint: bersama.endpoint, enabledAt: expect.any(Date) },
    ]);
  });

  it("is turned off for one browser, leaving the Akun Staf's other Perangkat Push", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    const laptop = browserPushSubscription();
    await setup.notifications.enablePush(adminLokasi, { subscription: ponsel });
    await setup.notifications.enablePush(adminLokasi, { subscription: laptop });

    expect(await setup.notifications.disablePush(adminLokasi, { endpoint: ponsel.endpoint })).toEqual({ ok: true });

    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toEqual([
      { endpoint: laptop.endpoint, enabledAt: expect.any(Date) },
    ]);
  });

  it("turning push on and off each records an Entri Audit on the Akun", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();

    await setup.notifications.enablePush(adminLokasi, { subscription: ponsel });
    await setup.notifications.disablePush(adminLokasi, { endpoint: ponsel.endpoint });

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: adminLokasi.accountId });
    expect(entries.filter((entry) => entry.action.startsWith("akun.push"))).toEqual([
      expect.objectContaining({
        actor: { accountId: adminLokasi.accountId, role: "admin_lokasi" },
        action: "akun.push_aktifkan",
        before: { perangkatPush: 0 },
        after: { perangkatPush: 1 },
      }),
      expect.objectContaining({
        actor: { accountId: adminLokasi.accountId, role: "admin_lokasi" },
        action: "akun.push_matikan",
        before: { perangkatPush: 1 },
        after: { perangkatPush: 0 },
      }),
    ]);
  });

  it("a staff page confirming the same browser's push again writes nothing and records no second Entri Audit", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    await setup.notifications.enablePush(adminLokasi, { subscription: ponsel });

    expect(await setup.notifications.enablePush(adminLokasi, { subscription: ponsel })).toEqual({ ok: true });

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: adminLokasi.accountId });
    expect(entries.filter((entry) => entry.action === "akun.push_aktifkan")).toHaveLength(1);
  });

  it("turning push off for a browser of another Akun Staf changes nothing and records no Entri Audit", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "082222222222");
    const mitraJasa = await invitedStaff(setup, admin, "mitra_jasa", "083333333333");
    const milikAdminLokasi = browserPushSubscription();
    await setup.notifications.enablePush(adminLokasi, { subscription: milikAdminLokasi });

    expect(await setup.notifications.disablePush(mitraJasa, { endpoint: milikAdminLokasi.endpoint })).toEqual({ ok: true });

    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toHaveLength(1);
    const entries = await setup.audit.entriesAbout({ kind: "akun", id: mitraJasa.accountId });
    expect(entries.filter((entry) => entry.action === "akun.push_matikan")).toEqual([]);
  });

  it("turning push off again for a browser already off records no second Entri Audit", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    await setup.notifications.enablePush(adminLokasi, { subscription: ponsel });
    await setup.notifications.disablePush(adminLokasi, { endpoint: ponsel.endpoint });

    expect(await setup.notifications.disablePush(adminLokasi, { endpoint: ponsel.endpoint })).toEqual({ ok: true });

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: adminLokasi.accountId });
    expect(entries.filter((entry) => entry.action === "akun.push_matikan")).toHaveLength(1);
  });

  it("only an Akun Staf turns push on: a Pemesan is refused and nothing is stored", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { login, cookies } = await logInByOtp(setup.identity, setup.whatsapp, "084444444444");
    const pemesan = await actorOf(setup.identity, cookies);

    expect(await setup.notifications.enablePush(pemesan, { subscription: browserPushSubscription() })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.notifications.pushDevices(login.account.id)).toEqual([]);
  });

  it("an Admin Platform that has not passed TOTP in this session is refused (perlu_totp) and nothing is stored", async () => {
    const setup = notificationsOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    const { login, cookies } = await logInByOtp(setup.identity, setup.whatsapp, "081111111111");
    const belumTotp = await actorOf(setup.identity, cookies);

    expect(await setup.notifications.enablePush(belumTotp, { subscription: browserPushSubscription() })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await setup.notifications.pushDevices(login.account.id)).toEqual([]);
  });

  it("refuses a browser whose push data is not valid (no https push service, or bad keys): perangkat_tidak_valid", async () => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const valid = browserPushSubscription();

    for (const subscription of [
      { ...valid, endpoint: "http://push.example/1" },
      { ...valid, keys: { ...valid.keys, p256dh: "c2hvcnQ" } },
      { ...valid, keys: { ...valid.keys, auth: "" } },
    ]) {
      expect(await setup.notifications.enablePush(adminLokasi, { subscription })).toEqual({
        ok: false,
        reason: "perangkat_tidak_valid",
      });
    }
    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toEqual([]);
  });
});
