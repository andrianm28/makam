/**
 * The family message at a Lokasi Mitra's Berhenti decision (ticket 59): families with an order or a Paket Layanan
 * there hear it the day it is decided, with the effective date. It asks nothing, so it goes at any hour.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const LOKASI = { id: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" };

describe("the Berhenti notice to a family", () => {
  it("tells each family the Lokasi stops and from which date, at any hour, once however often it is announced", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.clock.set(wib("2026-10-09 22:10"));
    const input = {
      lokasi: LOKASI,
      berlakuOn: "2026-11-08",
      penerima: [
        { kunci: "MKM-2026-000001", nomor: "MKM-2026-000001", email: "keluarga@contoh.id" },
        { kunci: "MKM-2026-000002", nomor: "MKM-2026-000002", email: "paket@contoh.id" },
      ],
    };

    expect(await setup.notifications.lokasiBerhenti(input)).toEqual({ ok: true, diberitahu: 2 });
    expect(await setup.notifications.lokasiBerhenti(input)).toEqual({ ok: true, diberitahu: 0 });
    expect(await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).toMatchObject({ terkirim: 2 });

    const surat = setup.email.sent.find((message) => message.to === "keluarga@contoh.id");
    expect(surat?.subject).toContain("Makam Wakaf Al-Ikhlas");
    expect(surat?.text).toContain("MKM-2026-000001");
    expect(surat?.text).toContain("8 November 2026");
    expect(setup.email.sent).toHaveLength(2);
  });

  it("skips a family nobody can email, since the Lokasi's staff will hand over the news by phone", async () => {
    const setup = notificationsOnTestDatabase(db);

    expect(
      await setup.notifications.lokasiBerhenti({ lokasi: LOKASI, berlakuOn: "2026-11-08", penerima: [{ kunci: "MKM-2026-000009", nomor: "MKM-2026-000009", email: null }] }),
    ).toEqual({ ok: true, diberitahu: 0 });
    expect(setup.email.sent).toHaveLength(0);
  });
});
