import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeWebPush } from "@/adapters/memory";
import type { PushResult } from "@/ports/web-push";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { browserPushSubscription, notificationsOnTestDatabase, signedInStaff } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A push service that fails until told to recover, then behaves like the fake. */
function pushYangPulih() {
  const fake = new FakeWebPush();
  const state = { down: true, tries: 0 };
  return {
    state,
    fake,
    send: async (push: Parameters<FakeWebPush["send"]>[0]): Promise<PushResult> => {
      state.tries += 1;
      if (state.down) throw new Error("push service timed out");
      return fake.send(push);
    },
  };
}

async function siap(push?: ReturnType<typeof pushYangPulih>) {
  const setup = notificationsOnTestDatabase(db, push ? { webPush: { send: push.send } } : {});
  const staf = await signedInStaff(setup, "admin_lokasi");
  await setup.notifications.enablePush(staf, { subscription: browserPushSubscription() });
  await setup.notifications.peringatanAntreanTier1({
    to: [{ accountId: staf.accountId }],
    tahap: "baru",
    row: { label: "Saat Duka baru", subjectLabel: "MKM-2026-000123", href: "/staf/antrean" },
  });
  const mendesak = async () =>
    (await setup.notifications.pesanStaf(staf.accountId)).filter((pesan) => pesan.template === "staf_antrean_mendesak");
  const suratMendesak = () => setup.email.sent.filter((surat) => surat.subject.startsWith("Antrean mendesak"));
  return { setup, staf, mendesak, suratMendesak };
}

describe("a Peringatan Staf whose send failed is retried by the worker", () => {
  it("tries again when push and email both fail, logs each attempt, and stops once one send goes through on each channel", async () => {
    const push = pushYangPulih();
    const { setup, mendesak, suratMendesak } = await siap(push);
    setup.email.failNextSend(1);

    await setup.notifications.kirimPeringatanAntreanTick();
    expect((await mendesak()).map((pesan) => [pesan.channel, pesan.status]).sort()).toEqual([
      ["email", "gagal"],
      ["push", "gagal"],
    ]);

    // Not before the backoff (15 minutes): a tick a minute later sends nothing.
    setup.clock.advance({ minutes: 1 });
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(await mendesak()).toHaveLength(2);

    // The push service recovers; the email relay already does. Both go out on the retry.
    push.state.down = false;
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick();
    const log = await mendesak();
    expect(log).toHaveLength(4);
    expect(log.filter((pesan) => pesan.status === "terkirim").map((pesan) => pesan.channel).sort()).toEqual(["email", "push"]);
    expect(suratMendesak()).toHaveLength(1);
    expect(push.fake.sent).toHaveLength(1);

    // Done: further ticks, however late, send nothing.
    setup.clock.advance({ hours: 6 });
    await setup.notifications.kirimPeringatanAntreanTick();
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(await mendesak()).toHaveLength(4);
    expect(suratMendesak()).toHaveLength(1);
    expect(push.fake.sent).toHaveLength(1);
  });

  it("does not send again on a channel that went through: only the email is retried when the push was delivered", async () => {
    const { setup, mendesak, suratMendesak } = await siap();
    setup.email.failNextSend(1);

    await setup.notifications.kirimPeringatanAntreanTick();
    expect(suratMendesak()).toHaveLength(0);
    expect(setup.webPush.sent).toHaveLength(1);

    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(suratMendesak()).toHaveLength(1);
    expect(setup.webPush.sent).toHaveLength(1);
    expect((await mendesak()).filter((pesan) => pesan.channel === "push")).toHaveLength(1);
  });

  it("is idempotent: a tick run twice at the same moment sends nothing twice", async () => {
    const { setup, suratMendesak } = await siap();

    await setup.notifications.kirimPeringatanAntreanTick();
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(suratMendesak()).toHaveLength(1);
    expect(setup.webPush.sent).toHaveLength(1);

  });

  it("is idempotent for a failing alert too: a second tick in the same minute does not try it again", async () => {
    const { setup, mendesak } = await siap();
    setup.email.failNextSend(5);
    await setup.notifications.kirimPeringatanAntreanTick();
    await setup.notifications.kirimPeringatanAntreanTick();
    expect((await mendesak()).filter((pesan) => pesan.channel === "email")).toHaveLength(1);
  });

  it("gives up after 4 sends, like a family message, without a Telepon Pemesan row, and the bell lists the alert once", async () => {
    const { setup, staf, mendesak } = await siap();
    setup.email.failNextSend(20);

    for (const menit of [0, 15, 60, 240]) {
      setup.clock.advance({ minutes: menit });
      await setup.notifications.kirimPeringatanAntreanTick();
    }
    const emailLog = (await mendesak()).filter((pesan) => pesan.channel === "email");
    expect(emailLog.map((pesan) => pesan.status)).toEqual(["gagal", "gagal", "gagal", "gagal"]);

    // Stopped: no fifth attempt, ever, and nothing escalated to a call row.
    setup.clock.advance({ days: 2 });
    await setup.notifications.kirimPeringatanAntreanTick();
    expect((await mendesak()).filter((pesan) => pesan.channel === "email")).toHaveLength(4);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
    const lonceng = await setup.notifications.staffAlerts(staf);
    expect(lonceng.ok && lonceng.latest.filter((entry) => entry.title.startsWith("Antrean mendesak"))).toHaveLength(1);
  });

  it("an alert that throws is recorded as its own failed attempt: the other alerts' sends stay recorded and are not sent again", async () => {
    const setup = notificationsOnTestDatabase(db);
    const staf = await signedInStaff(setup, "admin_lokasi");
    await setup.notifications.enablePush(staf, { subscription: browserPushSubscription() });
    // An email address in a push title is refused (it would show on the lock screen): this alert throws when sent.
    await setup.notifications.peringatanAntreanTier1({
      to: [{ accountId: staf.accountId }],
      tahap: "baru",
      row: { label: "bocor@contoh.id", subjectLabel: "MKM-2026-000001", href: "/staf/antrean" },
    });
    await setup.notifications.peringatanAntreanTier1({
      to: [{ accountId: staf.accountId }],
      tahap: "baru",
      row: { label: "Saat Duka baru", subjectLabel: "MKM-2026-000002", href: "/staf/antrean" },
    });
    const surat = () => setup.email.sent.filter((satu) => satu.subject.startsWith("Antrean mendesak"));

    await setup.notifications.kirimPeringatanAntreanTick();
    expect(surat().map((satu) => satu.subject)).toEqual(["Antrean mendesak: Saat Duka baru"]);

    // Next tick, past the backoff: the good alert is not resent; the throwing one is only tried again, never delivered.
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(surat()).toHaveLength(1);
    expect(setup.webPush.sent).toHaveLength(1);
  });

  it("a retry adds no second bell entry", async () => {
    const { setup, staf } = await siap();
    setup.email.failNextSend(1);
    await setup.notifications.kirimPeringatanAntreanTick();
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick();
    const lonceng = await setup.notifications.staffAlerts(staf);
    expect(lonceng.ok && lonceng.latest).toHaveLength(1);
  });
});

describe("a retried Antrean alert whose row has closed is dropped", () => {
  async function antrekan(tahap: "baru" | "eskalasi_90", key: string) {
    const setup = notificationsOnTestDatabase(db);
    const staf = await signedInStaff(setup, "admin_lokasi");
    await setup.notifications.enablePush(staf, { subscription: browserPushSubscription() });
    await setup.notifications.peringatanAntreanTier1({
      to: [{ accountId: staf.accountId }],
      tahap,
      row: { label: "Saat Duka baru", subjectLabel: "MKM-2026-000123", href: "/staf/antrean", key },
    });
    setup.email.failNextSend(20);
    const emailLog = async () =>
      (await setup.notifications.pesanStaf(staf.accountId)).filter((pesan) => pesan.channel === "email");
    return { setup, staf, emailLog };
  }

  it("drops a retried `baru` alert once the row was taken or closed", async () => {
    const { setup, emailLog } = await antrekan("baru", "row-baru");
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(await emailLog()).toHaveLength(1);

    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick({ barisMasihTerbukaBelumDiambil: async () => false });
    expect((await emailLog()).filter((pesan) => pesan.status === "gagal")).toHaveLength(1);
    expect((await emailLog()).some((pesan) => pesan.status === "dibatalkan")).toBe(true);
  });

  it("drops a retried `eskalasi_90` alert once the row closed, but still retries while it is open", async () => {
    const { setup, emailLog } = await antrekan("eskalasi_90", "row-90");
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(await emailLog()).toHaveLength(1);

    // Still open (taken or not): the 90 min confirmation is retried.
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanAntreanTick({ barisMasihTerbuka: async () => true });
    expect(await emailLog()).toHaveLength(2);

    // Closed: the next retry is dropped, nothing more sent.
    setup.clock.advance({ hours: 1 });
    await setup.notifications.kirimPeringatanAntreanTick({ barisMasihTerbuka: async () => false });
    expect((await emailLog()).filter((pesan) => pesan.status === "gagal")).toHaveLength(2);
    expect((await emailLog()).some((pesan) => pesan.status === "dibatalkan")).toBe(true);
  });
});
