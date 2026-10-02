/**
 * The family messages a Pemesanan Makam brings (spec, Notifications; ticket
 * 23, AC "Pesan pengajuan pesanan dan konfirmasi ke Email Terverifikasi
 * Pemesan"): a Saat Duka order submitted, and the same order confirmed. Both
 * are about Lokasi work, so a send that keeps failing reaches the Lokasi's own
 * staff as a call row, never Admin Platform's.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";
import { resetDatabase, testDatabase } from "../../../tests/support/database";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PESANAN_ID = "3b2a1f90-0000-4000-8000-000000000001";
const LOKASI = { id: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" };

/** What the Pemesanan module hands Notifications when a Saat Duka order is placed. */
function pesananDiajukan(email: string | null = "keluarga@contoh.id") {
  return {
    pemesananId: PESANAN_ID,
    nomor: "MKM-2026-000001",
    email,
    pemesanName: "Budi Santoso",
    lokasi: LOKASI,
    jenisMakamName: "Reguler 1 × 2 m",
    almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
    rencanaPemakamanAt: wib("2026-10-02 10:00"),
    konfirmasiDueAt: wib("2026-10-01 11:00"),
  };
}

/** What it hands Notifications when the Lokasi confirms that same order. */
function pesananDikonfirmasi(email: string | null = "keluarga@contoh.id") {
  return {
    pemesananId: PESANAN_ID,
    nomor: "MKM-2026-000001",
    email,
    pemesanName: "Budi Santoso",
    lokasi: LOKASI,
    jenisMakamName: "Reguler 1 × 2 m",
    almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
    pemakamanAt: wib("2026-10-02 10:00"),
    petak: { nomor: "A-01" },
    kontakLokasi: { name: "Yayasan Al-Ikhlas", phoneNumber: "+628111111111" },
    dokumen: ["KTP", "Kartu Keluarga"],
    tagihan: { nomorTagihan: "TGH-2026-000123", total: 9_650_000, dueAt: wib("2026-10-05 10:00"), link: "abc123" },
  };
}

describe("a Saat Duka order submitted reaches the family's verified email", () => {
  it("queues a transactional message naming the order, the Lokasi and the confirmation promise", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.clock.set(wib("2026-10-01 22:00"));

    expect(await setup.notifications.pesananDiajukan(pesananDiajukan())).toEqual({ ok: true });

    // Transactional: it asks nothing, so it goes at any hour, like a new-order alert.
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const sent = setup.email.sent.filter((message) => message.to === "keluarga@contoh.id");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("MKM-2026-000001");
    expect(sent[0]?.text).toContain("Makam Wakaf Al-Ikhlas");
    expect(sent[0]?.text).toContain("Siti Aminah");
    expect(sent[0]?.text).toContain("/pesanan/MKM-2026-000001");
    // The promise the Lokasi's Jam Operasional gave is the one the family reads, and nothing is billed yet.
    expect(sent[0]?.text).toContain("1 Oktober 2026, 11.00 WIB");
    expect(sent[0]?.text).not.toContain("TGH-");
  });

  it("is logged on the order, one message however often the announcement is made", async () => {
    const setup = notificationsOnTestDatabase(db);
    await setup.notifications.pesananDiajukan(pesananDiajukan());
    await setup.notifications.pesananDiajukan(pesananDiajukan());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(setup.email.sent.filter((message) => message.to === "keluarga@contoh.id")).toHaveLength(1);
    expect(await setup.notifications.pesanPemesanan(PESANAN_ID)).toEqual([
      expect.objectContaining({ template: "pesanan_diajukan", channel: "email", status: "terkirim" }),
    ]);
  });

  it("an order with no email is not emailed at all and opens a call row for the Admin Lokasi", async () => {
    const setup = notificationsOnTestDatabase(db);

    await setup.notifications.pesananDiajukan(pesananDiajukan(null));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(await setup.notifications.pesanPemesanan(PESANAN_ID)).toEqual([]);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([
      expect.objectContaining({ subjectKind: "pemesanan", lokasiId: LOKASI.id, nomorPemesanan: "MKM-2026-000001", sebab: "tanpa_email" }),
    ]);
  });
});

describe("the same order confirmed reaches the family's verified email", () => {
  it("names the assigned Petak, the Lokasi's contact, the document checklist and the payment deadline", async () => {
    const setup = notificationsOnTestDatabase(db);

    expect(await setup.notifications.pesananDikonfirmasi(pesananDikonfirmasi())).toEqual({ ok: true });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const sent = setup.email.sent.filter((message) => message.to === "keluarga@contoh.id");
    expect(sent).toHaveLength(1);
    const text = sent[0]!.text;
    expect(text).toContain("A-01");
    expect(text).toContain("+628111111111");
    expect(text).toContain("Kartu Keluarga");
    expect(text).toContain("TGH-2026-000123");
    expect(text).toContain("5 Oktober 2026, 10.00 WIB");
    // Payment never holds up the burial, and documents may follow.
    expect(text).toContain("Pemakaman tetap berjalan");
  });

  it("an email that keeps failing leaves a call row for the Lokasi's own staff, not for Admin Platform", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.email.failNextSend(8);

    await setup.notifications.pesananDikonfirmasi(pesananDikonfirmasi());
    // The first send plus its three retries, spaced by the backoff the module uses.
    for (let tick = 0; tick < 5; tick++) {
      setup.clock.advance({ hours: 4 });
      await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    }

    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([
      expect.objectContaining({
        subjectKind: "pesan_lokasi",
        lokasiId: LOKASI.id,
        nomorPemesanan: "MKM-2026-000001",
        sebab: "pesan_gagal",
      }),
    ]);
    expect(await setup.notifications.pesanPemesanan(PESANAN_ID)).toEqual([
      expect.objectContaining({ template: "pesanan_dikonfirmasi", status: "gagal", attempts: 4 }),
    ]);
  });
});

describe("the Pemegang Hak's consent request for a further burial (Makamkan di sini)", () => {
  it("is an ordinary email with a link to Akun Saya and no code, logged on the order", async () => {
    const setup = notificationsOnTestDatabase(db);
    setup.clock.set(wib("2026-10-01 22:00"));

    const hasil = await setup.notifications.tumpangMintaPersetujuan({
      pemesananId: PESANAN_ID,
      nomor: "MKM-2026-000001",
      email: "pemegang@contoh.id",
      pemegangHakName: "Siti Aminah",
      pemesanName: "Budi Santoso",
      lokasi: LOKASI,
      almarhum: { name: "Hasan Basri", tanggalWafat: "2026-09-30" },
    });
    expect(hasil).toEqual({ ok: true });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const sent = setup.email.sent.filter((message) => message.to === "pemegang@contoh.id");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("Hasan Basri");
    expect(sent[0]?.text).toContain("/akun");
    expect(sent[0]?.text).toContain("Setujui");
    // No code of its own: it points at the usual Kode Masuk sign-in and carries no six-digit code besides the Nomor Pemesanan.
    expect(sent[0]?.text.replace("MKM-2026-000001", "")).not.toMatch(/\b\d{6}\b/);
    expect(await setup.notifications.pesanPemesanan(PESANAN_ID)).toEqual([
      expect.objectContaining({ template: "tumpang_minta_persetujuan", channel: "email", status: "terkirim" }),
    ]);
  });
});
