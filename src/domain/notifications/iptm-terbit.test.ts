/**
 * The IPTM handed over at IPTM Terbit (ticket 46; spec, Pengurusan: "The IPTM is handed over regardless of
 * payment"), read from what the fake EmailSender received.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const iptm = (over: object = {}) => ({
  pengurusanId: "6f1b2a0e-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nomor: "MKM-2026-000007",
  email: "pemesan@contoh.id",
  tpu: { name: "TPU Kober" },
  almarhumName: "Siti Aminah",
  pemegangHak: { name: "Hasan Basri", email: "hasan@contoh.id" },
  berlakuSampai: "2029-10-19",
  ...over,
});

describe("IPTM Terbit announced to the family", () => {
  it("emails the Pemesan and, at another address, the Pemegang Hak, once each, whatever the Tagihan's status", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.clock.set(wib("2026-10-20 03:00"));

    expect(await setup.notifications.iptmTerbit(iptm())).toEqual({ ok: true });
    expect(await setup.notifications.iptmTerbit(iptm())).toEqual({ ok: true });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const ke = (alamat: string) => setup.email.sent.filter((pesan) => pesan.to === alamat);
    expect(ke("pemesan@contoh.id")).toHaveLength(1);
    expect(ke("hasan@contoh.id")).toHaveLength(1);
    expect(ke("pemesan@contoh.id")[0]).toMatchObject({ subject: expect.stringContaining("IPTM terbit") });
    expect(ke("pemesan@contoh.id")[0]!.text).toContain("/pengurusan/MKM-2026-000007");
    expect(ke("hasan@contoh.id")[0]!.text).toContain("Yth. Hasan Basri");
  });

  it("sends the Pemesan only one email when the Pemegang Hak has the same address or none", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.clock.set(wib("2026-10-20 03:00"));
    await setup.notifications.iptmTerbit(iptm({ pemegangHak: { name: "Budi", email: "PEMESAN@contoh.id" } }));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(setup.email.sent).toHaveLength(1);
  });

  it("rejects a malformed announcement", async () => {
    const setup = notificationsOnTestDatabase(db);
    expect(await setup.notifications.iptmTerbit(iptm({ berlakuSampai: "besok" }))).toEqual({ ok: false, reason: "pengurusan_tidak_valid" });
  });
});
