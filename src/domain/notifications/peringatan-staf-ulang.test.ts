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

/** A Saat Duka baru alert a domain event queues directly, as ticket 23 raises it. */
const saatDukaBaru = {
  kind: "staf_saat_duka_baru" as const,
  email: {
    subject: "Pemesanan Saat Duka baru: MKM-2026-000123",
    text: "MKM-2026-000123 di Taman Makam Contoh menunggu konfirmasi.",
  },
  push: {
    title: "Pemesanan Saat Duka baru",
    body: "MKM-2026-000123 di Taman Makam Contoh menunggu konfirmasi",
    url: "/staf/admin-lokasi",
  },
};

async function siap(push?: ReturnType<typeof pushYangPulih>, subject?: { kind: string; id: string }) {
  const setup = notificationsOnTestDatabase(db, push ? { webPush: { send: push.send } } : {});
  const staf = await signedInStaff(setup, "admin_lokasi");
  await setup.notifications.enablePush(staf, { subscription: browserPushSubscription() });
  await setup.notifications.antrekanPeringatanStaf({ to: { accountId: staf.accountId }, subject, ...saatDukaBaru });
  const logged = async () =>
    (await setup.notifications.pesanStaf(staf.accountId)).filter((pesan) => pesan.template === "staf_saat_duka_baru");
  const surat = () => setup.email.sent.filter((pesan) => pesan.subject.startsWith("Pemesanan Saat Duka baru"));
  return { setup, staf, logged, surat };
}

describe("a direct Peringatan Staf is queued and sent by the worker, then retried", () => {
  it("sends nothing until the worker's tick, then tries again when push and email both fail, logging each attempt", async () => {
    const push = pushYangPulih();
    const { setup, logged, surat } = await siap(push);
    setup.email.failNextSend(1);

    // Only queued: the domain event's request sent nothing.
    expect(surat()).toHaveLength(0);
    expect(setup.webPush.sent).toHaveLength(0);

    await setup.notifications.kirimPeringatanStafTick();
    expect((await logged()).map((pesan) => [pesan.channel, pesan.status]).sort()).toEqual([
      ["email", "gagal"],
      ["push", "gagal"],
    ]);

    // Not before the backoff (15 minutes): a tick a minute later sends nothing.
    setup.clock.advance({ minutes: 1 });
    await setup.notifications.kirimPeringatanStafTick();
    expect(await logged()).toHaveLength(2);

    // The push service recovers; the email relay already does. Both go out on the retry.
    push.state.down = false;
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanStafTick();
    const log = await logged();
    expect(log).toHaveLength(4);
    expect(log.filter((pesan) => pesan.status === "terkirim").map((pesan) => pesan.channel).sort()).toEqual(["email", "push"]);
    expect(surat()).toHaveLength(1);
    expect(push.fake.sent).toHaveLength(1);

    // Done: further ticks, however late, send nothing.
    setup.clock.advance({ hours: 6 });
    await setup.notifications.kirimPeringatanStafTick();
    expect(await logged()).toHaveLength(4);
    expect(surat()).toHaveLength(1);
    expect(push.fake.sent).toHaveLength(1);
  });

  it("does not send again on a channel that went through: only the email is retried when the push was delivered", async () => {
    const { setup, logged, surat } = await siap();
    setup.email.failNextSend(1);

    await setup.notifications.kirimPeringatanStafTick();
    expect(surat()).toHaveLength(0);
    expect(setup.webPush.sent).toHaveLength(1);

    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanStafTick();
    expect(surat()).toHaveLength(1);
    expect(setup.webPush.sent).toHaveLength(1);
    expect((await logged()).filter((pesan) => pesan.channel === "push")).toHaveLength(1);
  });

  it("is idempotent: a tick run twice at the same moment sends nothing twice", async () => {
    const { setup, staf, surat } = await siap();

    await setup.notifications.kirimPeringatanStafTick();
    await setup.notifications.kirimPeringatanStafTick();
    expect(surat()).toHaveLength(1);
    expect(setup.webPush.sent).toHaveLength(1);
    // The bell entry is written once, not once per tick.
    const lonceng = await setup.notifications.staffAlerts(staf);
    expect(lonceng.ok && lonceng.latest).toHaveLength(1);
  });

  it("gives up after 4 sends, without a Telepon Pemesan row, and the bell lists the alert once", async () => {
    const { setup, staf, logged } = await siap();
    setup.email.failNextSend(20);

    for (const menit of [0, 15, 60, 240]) {
      setup.clock.advance({ minutes: menit });
      await setup.notifications.kirimPeringatanStafTick();
    }
    const emailLog = (await logged()).filter((pesan) => pesan.channel === "email");
    expect(emailLog.map((pesan) => pesan.status)).toEqual(["gagal", "gagal", "gagal", "gagal"]);

    // Stopped: no fifth attempt, ever, and nothing escalated to a call row.
    setup.clock.advance({ days: 2 });
    await setup.notifications.kirimPeringatanStafTick();
    expect((await logged()).filter((pesan) => pesan.channel === "email")).toHaveLength(4);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
    const lonceng = await setup.notifications.staffAlerts(staf);
    expect(lonceng.ok && lonceng.latest).toHaveLength(1);
  });

  it("drops a retry whose subject no longer needs it, where the owning module supplies the answer", async () => {
    const { setup, logged, surat } = await siap(undefined, { kind: "pemesanan", id: "pesanan-1" });
    setup.email.failNextSend(20);

    await setup.notifications.kirimPeringatanStafTick();
    expect((await logged()).filter((pesan) => pesan.channel === "email")).toHaveLength(1);

    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanStafTick({ subjekMasihPerlu: async () => false });

    // Dropped: no second send, one `dibatalkan` log row, and never picked up again.
    expect((await logged()).filter((pesan) => pesan.channel === "email" && pesan.status === "gagal")).toHaveLength(1);
    expect((await logged()).some((pesan) => pesan.status === "dibatalkan")).toBe(true);
    setup.clock.advance({ days: 2 });
    await setup.notifications.kirimPeringatanStafTick();
    expect(surat()).toHaveLength(0);
  });
});
