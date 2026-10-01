/**
 * Who a Bukti Pencairan is sent to (spec, Billing > Payouts: "the recipient gets
 * its link by message", story 135; ticket 32's AC 5 and AC 7).
 *
 * A Lokasi Mitra is a partnership with no login of its own, so its Bukti goes to
 * its own Admin Lokasi — the people who reconcile against it — while a Mitra
 * Jasa's goes to that person. This is the one decision the Payouts module leaves
 * to the composition, so it is tested here rather than assumed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kirimBuktiPencairanKe } from "@/composition/payouts";
import type { KirimBuktiPencairan } from "@/domain/payouts";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import {
  mitraJasa,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The sender the composition builds, with the real Identity and Notifications behind it. */
function kirimKe(setup: PayoutsModul): KirimBuktiPencairan {
  return kirimBuktiPencairanKe({ identity: setup.identity, notifications: setup.notifications });
}

/** Only the messages about a Bukti Pencairan: the fixtures' own email is not what is under test. */
const buktiDikirim = (setup: PayoutsModul) => setup.email.sent.filter((message) => message.subject.startsWith("Bukti Pencairan"));

/** A Bukti Pencairan as the transfer hands it to the sender, for the given recipient. */
function buktiUntuk(recipient: Parameters<KirimBuktiPencairan>[0]["recipient"]) {
  return {
    id: "bkp-1",
    recipient,
    nomorBukti: "BKP/2026/000001",
    url: "https://makam.test/dokumen/abc",
    ditransferPada: "2026-10-01",
    amount: 9_500_000 as Parameters<KirimBuktiPencairan>[0]["amount"],
  };
}

describe("the Bukti Pencairan's own message", () => {
  it("goes to a Lokasi Mitra's Admin Lokasi, never to the family or another Lokasi", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    // A second Lokasi Mitra, whose Admin Lokasi must hear nothing about this one.
    await pesananSaatDukaSiap(setup, { name: "Makam Sawah Besar", email: "keluarga.lain@contoh.id" });

    await kirimKe(setup)(buktiUntuk({ kind: "lokasi_mitra", lokasiId: fixture.lokasiMitra.id, nama: fixture.lokasiMitra.name }), db);
    await setup.notifications.kirimPeringatanStafTick();

    // The fixture's Admin Lokasi is the one invited to this Lokasi Mitra, and it is
    // the only Akun Staf told.
    const terkirim = buktiDikirim(setup);
    expect(terkirim.map((message) => message.to)).toEqual(["lokasi.saat-duka-1@contoh.id"]);
    expect(terkirim[0]?.subject).toBe("Bukti Pencairan BKP/2026/000001");
    expect(terkirim[0]?.text).toContain("https://makam.test/dokumen/abc");
    // And it is in that account's own bell, which is the push's half. The push
    // opens the Admin Lokasi's own page, never the document: a Peringatan Staf's
    // push may only open a staff page.
    const alerts = await setup.notifications.staffAlerts(fixture.adminLokasi);
    if (!alerts.ok) throw new Error(`the bell was refused: ${alerts.reason}`);
    expect(alerts.latest.filter((entry) => entry.title === "Bukti Pencairan")).toMatchObject([
      { body: "BKP/2026/000001 · Rp 9.500.000", url: "/staf/admin-lokasi" },
    ]);
  });

  it("goes to the Mitra Jasa whose job it pays, and to nobody else", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const { actor: mitra, email } = await mitraJasa(setup, fixture.admin);

    await kirimKe(setup)(
      buktiUntuk({ kind: "mitra_jasa", akunId: mitra.accountId, nama: "Rina Partial", lokasiId: fixture.lokasiMitra.id }),
      db,
    );
    await setup.notifications.kirimPeringatanStafTick();

    expect(buktiDikirim(setup).map((message) => message.to)).toEqual([email]);
    const alerts = await setup.notifications.staffAlerts(mitra);
    if (!alerts.ok) throw new Error(`the bell was refused: ${alerts.reason}`);
    expect(alerts.latest.filter((entry) => entry.title === "Bukti Pencairan")).toMatchObject([{ url: "/staf/mitra-jasa/pencairan" }]);
    // The Lokasi Mitra's own Admin Lokasi is not told: the job and the rate are
    // the Mitra Jasa's, and the Lokasi's reconciliation never showed them anyway.
    const milikLokasi = await setup.notifications.staffAlerts(fixture.adminLokasi);
    if (!milikLokasi.ok) throw new Error(`the bell was refused: ${milikLokasi.reason}`);
    expect(milikLokasi.latest.filter((entry) => entry.title === "Bukti Pencairan")).toEqual([]);
  });

  it("queues the Bukti Pencairan's alert inside the transfer's own transaction, so a rollback drops it", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);

    // The issuing transaction rolls back after the alert was queued (ticket 96):
    // the alert must go with it, not outlive a Bukti Pencairan that never existed.
    await db
      .transaction(async (tx) => {
        await kirimKe(setup)(buktiUntuk({ kind: "lokasi_mitra", lokasiId: fixture.lokasiMitra.id, nama: fixture.lokasiMitra.name }), tx);
        throw new Error("transfer rolled back");
      })
      .catch(() => undefined);
    await setup.notifications.kirimPeringatanStafTick();

    expect(buktiDikirim(setup)).toEqual([]);
  });

  it("reaches a Lokasi Mitra with no Admin Lokasi at all without failing", async () => {    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const takAda = await setup.lokasi.removeAdminLokasi(fixture.admin, fixture.lokasiMitra.id, {
      accountId: fixture.adminLokasi.accountId,
      reason: "Berhenti ",
    });
    if (!takAda.ok) throw new Error(`remove refused: ${takAda.reason}`);

    await kirimKe(setup)(buktiUntuk({ kind: "lokasi_mitra", lokasiId: fixture.lokasiMitra.id, nama: fixture.lokasiMitra.name }), db);
    await setup.notifications.kirimPeringatanStafTick();

    // Nobody to tell is not a failure: the Bukti is in the run and in the Lokasi's
    // own view either way, and a message is only ever a courtesy on top of it.
    expect(buktiDikirim(setup)).toEqual([]);
  });
});
