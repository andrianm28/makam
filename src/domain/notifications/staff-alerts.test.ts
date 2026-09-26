import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn, signedInAdminPlatform } from "../../../tests/support/identity";
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
  kind: "staf_saat_duka_baru" as const,
  email: {
    subject: "Pemesanan Saat Duka baru: MKM-2026-000123",
    text: "MKM-2026-000123 di Taman Makam Contoh (Petak tunggal, besok 10:00) menunggu konfirmasi sampai hari ini 21:00. Pemesan: Ibu Sari.",
  },
  push: {
    title: "Pemesanan Saat Duka baru",
    body: "MKM-2026-000123 di Taman Makam Contoh menunggu konfirmasi",
    url: "/staf/admin-lokasi",
  },
};

describe("Peringatan Staf", () => {
  it("a Peringatan Staf reaches every Perangkat Push and the email: the Akun Staf's Email Terverifikasi", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, email, webPush } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const ponsel = browserPushSubscription();
    const laptop = browserPushSubscription();
    await notifications.enablePush(adminLokasi, { subscription: ponsel });
    await notifications.enablePush(adminLokasi, { subscription: laptop });

    const sent = await notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...saatDukaBaru,
    });

    expect(sent).toEqual({ ok: true, email: "terkirim", push: { delivered: 2, removed: 0 } });
    expect(email.sent.filter((message) => message.subject === saatDukaBaru.email.subject)).toEqual([
      expect.objectContaining({ to: "admin.lokasi@contoh.id", text: saatDukaBaru.email.text }),
    ]);
    expect(webPush.sent).toHaveLength(2);
    expect(webPush.sent).toEqual(
      expect.arrayContaining([
        { subscription: ponsel, notification: saatDukaBaru.push },
        { subscription: laptop, notification: saatDukaBaru.push },
      ]),
    );
  });

  it("an Akun Staf without a Perangkat Push still gets the email", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, email, webPush } = setup;
    const petugas = await signedInStaff(setup, "petugas_lapangan");

    const sent = await notifications.sendStaffAlert({
      to: { accountId: petugas.accountId },
      kind: "staf_tugas_lapangan_baru",
      email: { subject: "Tugas Lapangan baru", text: "Kunjungan Verifikasi di Taman Makam Contoh, 2 Okt." },
      push: { title: "Tugas Lapangan baru", body: "Kunjungan Verifikasi, 2 Okt", url: "/staf/petugas-lapangan" },
    });

    expect(sent).toEqual({ ok: true, email: "terkirim", push: { delivered: 0, removed: 0 } });
    expect(email.sent.map((message) => [message.to, message.subject])).toContainEqual([
      "petugas.lapangan@contoh.id",
      "Tugas Lapangan baru",
    ]);
    expect(webPush.sent).toEqual([]);
  });

  it("still goes by push when the email send fails, and the failure goes to error monitoring without the address", async () => {
    const relayDown = new Error("relay refused admin.lokasi@contoh.id");
    const failingEmail = {
      send: async () => {
        throw relayDown;
      },
    };
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const withFailingEmail = notificationsOnTestDatabase(db, { email: failingEmail });
    await withFailingEmail.notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });

    const sent = await withFailingEmail.notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      ...saatDukaBaru,
    });

    expect(sent).toEqual({ ok: true, email: "gagal", push: { delivered: 1, removed: 0 } });
    expect(withFailingEmail.webPush.sent).toHaveLength(1);
    expect(withFailingEmail.reported).toHaveLength(1);
    const [report] = withFailingEmail.reported;
    expect(report?.error).toBeInstanceOf(Error);
    expect((report?.error as Error).message).not.toMatch(/admin\.lokasi@contoh\.id/);
    expect(JSON.stringify(report?.context)).not.toMatch(/admin\.lokasi@contoh\.id/);
    expect(report?.context.tags).toMatchObject({ channel: "email", template: "staf_saat_duka_baru" });
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
      email: "terkirim",
      push: { delivered: 0, removed: 0 },
    });
    expect(await setup.notifications.pushDevices(adminLokasi.accountId)).toHaveLength(1);
    expect(setup.reported).toEqual([
      { error: expect.objectContaining({ message: "push service timed out" }), context: { tags: expect.objectContaining({ channel: "push" }) } },
    ]);
  });

  it("is not sent to an Akun that no longer holds a staff role (Dinonaktifkan): no email, no push", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, email, webPush, identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");
    await notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });
    await identity.deactivateStaff(admin, { accountId: adminLokasi.accountId, reason: "Keluar dari Operator" });
    const sentBefore = email.sent.length;

    expect(
      await notifications.sendStaffAlert({
        to: { accountId: adminLokasi.accountId },
        ...saatDukaBaru,
      }),
    ).toEqual({ ok: false, reason: "bukan_akun_staf" });
    expect(email.sent.slice(sentBefore)).toEqual([]);
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

describe("Peringatan Staf on the lock screen", () => {
  it.each([
    ["a mobile number in the body", { body: "Hubungi Ibu Pemesan di 0812-3456-7890" }],
    ["a +62 number in the title", { title: "Pemesan +62 812 3456 7890 menunggu" }],
    ["an email address in the body", { body: "Balas ke sari@contoh.id" }],
  ])("refuses a push that carries %s: a push shows on the lock screen", async (_, text) => {
    const setup = notificationsOnTestDatabase(db);
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    await setup.notifications.enablePush(adminLokasi, { subscription: browserPushSubscription() });

    await expect(
      setup.notifications.sendStaffAlert({
        to: { accountId: adminLokasi.accountId },
        ...saatDukaBaru,
        push: { ...saatDukaBaru.push, ...text },
      }),
    ).rejects.toThrow(/lock screen/);
    expect(setup.webPush.sent).toEqual([]);
  });
});

describe("Perangkat Push", () => {
  it("is turned off by Keluar: after Keluar, a Peringatan Staf reaches that browser no more", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { notifications, webPush, identity } = setup;
    const adminLokasi = await signedInStaff(setup, "admin_lokasi");
    const { actor: diLaptop, cookies: laptopCookies } = await loggedInOnAnotherBrowser(setup, adminLokasi.email);
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
    const petugas = await invitedStaff(setup, admin, "petugas_lapangan", "petugas@contoh.id");
    await notifications.enablePush(petugas, { subscription: browserPushSubscription() });
    const invited = await identity.inviteStaff(admin, { email: "petugas@contoh.id", phoneNumber: "082222222222", role: "mitra_jasa" });
    expect(invited.ok).toBe(true);

    const { actor: diLaptop } = await loggedInOnAnotherBrowser(setup, petugas.email);
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
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");
    const { actor: diLaptop } = await loggedInOnAnotherBrowser(setup, adminLokasi.email);
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
      email: "terkirim",
      push: { delivered: 1, removed: 1 },
    });
    expect(await notifications.pushDevices(adminLokasi.accountId)).toEqual([
      { endpoint: baru.endpoint, enabledAt: expect.any(Date) },
    ]);

    expect(await notifications.sendStaffAlert({ to, ...saatDukaBaru })).toEqual({
      ok: true,
      email: "terkirim",
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
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");
    const mitraJasa = await invitedStaff(setup, admin, "mitra_jasa", "mitra@contoh.id");
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
    const adminLokasi = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");
    const mitraJasa = await invitedStaff(setup, admin, "mitra_jasa", "mitra@contoh.id");
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
    const { login, cookies } = await logIn(setup, "pemesan@contoh.id");
    const pemesan = await actorOf(setup.identity, cookies);

    expect(await setup.notifications.enablePush(pemesan, { subscription: browserPushSubscription() })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.notifications.pushDevices(login.account.id)).toEqual([]);
  });

  it("an Admin Platform that has not passed TOTP in this session is refused (perlu_totp) and nothing is stored", async () => {
    const setup = notificationsOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
    const { login, cookies } = await logIn(setup, "admin@makam.co.id");
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
