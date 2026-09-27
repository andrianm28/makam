/**
 * The family message that carries a Bukti Pemesanan (spec, Notifications; ADR
 * 0004: email is the Akun, and the document's link goes by email; ticket 25's
 * AC 4). It asks nothing, so it goes at any hour, and an order with no email
 * opens the call row instead of a message nobody reads.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PESANAN_ID = "3b2a1f90-0000-4000-8000-000000000001";
const LOKASI = { id: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" };
const LINK = "a".repeat(43);

/** What the Pemesanan module hands Notifications when a paid order earns its Bukti. */
function pesananBuktiPemesanan(email: string | null = "keluarga@contoh.id", pemesananId = PESANAN_ID) {
  return {
    pemesananId,
    nomor: "MKM-2026-000001",
    email,
    pemesanName: "Budi Santoso",
    lokasi: LOKASI,
    bukti: { nomor: "BPM/2026/000123", link: LINK },
    petakNomor: "A-01",
    pemegangHakName: "Budi Santoso",
    masa: { mulai: "2026-10-06", selesai: "2031-10-06" },
  };
}

describe("the Bukti Pemesanan message", () => {
  it("emails the family the document's link, its number and the right it proves, at any hour", async () => {
    const setup = notificationsOnTestDatabase(db);
    // Transactional, so it goes at any hour: 21:30 is well outside the reminder window.
    setup.clock.set(wib("2026-10-09 21:30"));

    expect(await setup.notifications.pesananBuktiPemesanan(pesananBuktiPemesanan())).toEqual({ ok: true });
    expect(await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).toMatchObject({ terkirim: 1 });

    const mailed = setup.email.sent.filter((message) => message.to === "keluarga@contoh.id");
    expect(mailed).toHaveLength(1);
    expect(mailed[0]?.subject).toContain("BPM/2026/000123");
    expect(mailed[0]?.text).toContain("A-01");
    expect(mailed[0]?.text).toContain("Budi Santoso");
    expect(mailed[0]?.text).toContain(`https://makam.test/dokumen/${LINK}`);
    // A right, not a bill: the money has its own Bukti Pembayaran.
    expect(mailed[0]?.text).not.toContain("Rp");
  });

  it("is queued once however often it is announced, and an order with no email opens a call row", async () => {
    const setup = notificationsOnTestDatabase(db);

    await setup.notifications.pesananBuktiPemesanan(pesananBuktiPemesanan());
    await setup.notifications.pesananBuktiPemesanan(pesananBuktiPemesanan());
    expect(await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).toMatchObject({ terkirim: 1 });
    expect(setup.email.sent).toHaveLength(1);

    const tanpaEmail = "3b2a1f90-0000-4000-8000-000000000002";
    expect(await setup.notifications.pesananBuktiPemesanan(pesananBuktiPemesanan(null, tanpaEmail))).toEqual({ ok: true });
    const [telepon] = await setup.notifications.teleponPemesanTerbuka();
    expect(telepon).toMatchObject({ subjectId: tanpaEmail, nomorPemesanan: "MKM-2026-000001", sebab: "tanpa_email" });
  });
});
