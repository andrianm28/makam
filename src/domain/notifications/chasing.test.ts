/**
 * Chasing overdue pay-after Tagihan (spec, Billing > Chasing; Notifications'
 * reminder table; ticket 29's AC 1, 2, 5).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { tagihan as tagihanTable } from "@/domain/billing/schema";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { invitedStaff, notificationsOnTestDatabase } from "../../../tests/support/notifications";
import { perpanjanganCheckout, siapkanOperator } from "../../../tests/support/notifications-messages";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI_ID = "5d1f4c2e-0000-4000-8000-000000000001";
const SAAT_DUKA_LOKASI = { kind: "lokasi_mitra", lokasiId: LOKASI_ID, name: "Taman Makam Contoh" } as const;

async function issueSaatDuka(setup: ReturnType<typeof notificationsOnTestDatabase>, burialAt: Date) {
  const issued = await setup.billing.issueTagihan(
    perpanjanganCheckout({
      moment: { kind: "saat_duka", burialAt, paymentWindowHours: 72 },
      lines: [
        { kind: "harga_hak_pakai", label: "Harga Hak Pakai", amount: rp(3_000_000), provider: SAAT_DUKA_LOKASI },
        { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
      ],
    }),
  );
  if (!issued.ok) throw new Error(`Tagihan refused: ${issued.reason}`);
  return issued.tagihan;
}

/** Anchors and, if asked, marks a Tagihan Lewat Jatuh Tempo directly (a stand-in for `setOverdueAnchor` + its tick, both ticket 25's). */
async function anchor(tagihanId: string, at: Date, lewat = true) {
  await db
    .update(tagihanTable)
    .set({ lewatJatuhTempoAt: at, status: lewat ? "lewat_jatuh_tempo" : "belum_dibayar" })
    .where(eq(tagihanTable.id, tagihanId));
}

describe("jadwalkanChasing: the four H+3/7/14/30 reminders", () => {
  it("queues them at 08:00 WIB on each H+N day of the anchor, and stops once the Tagihan is Lunas", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);

    const jadwal = await setup.notifications.jadwalkanChasing({
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: null,
      email: "keluarga@contoh.id",
      perihal: "Pemakaman Contoh di Taman Makam Contoh",
      total: tagihan.total,
      lewatJatuhTempoAt: anchorAt,
      link: tagihan.link,
    });
    expect(jadwal.dijadwalkan).toBe(4);

    const log = await setup.notifications.pesanTagihan(tagihan.id);
    expect(log.map((m) => m.template).sort()).toEqual(
      ["tagihan_pengingat_h14", "tagihan_pengingat_h3", "tagihan_pengingat_h30", "tagihan_pengingat_h7"].sort(),
    );

    // H+3 at 08:00 WIB: 2026-10-04 08:00.
    setup.clock.set(wib("2026-10-04 08:00"));
    let hasil = await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(hasil.terkirim).toBe(1);
    expect(setup.email.sent.filter((m) => m.to === "keluarga@contoh.id")).toHaveLength(1);

    // The Tagihan is paid before H+7: the rest of the schedule is dropped, not sent.
    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "transfer_manual" }, reference: null });
    expect(paid.ok).toBe(true);

    setup.clock.set(wib("2026-10-31 08:00")); // past H+30
    hasil = await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(hasil.terkirim).toBe(0);
    expect(hasil.dibatalkan).toBe(3);
    expect(setup.email.sent.filter((m) => m.to === "keluarga@contoh.id")).toHaveLength(1);
  });

  it("calling it again for the same Tagihan queues nothing new (idempotent by the Tagihan-per-template index)", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const input = {
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: null,
      email: "keluarga@contoh.id",
      perihal: "Pemakaman",
      total: tagihan.total,
      lewatJatuhTempoAt: anchorAt,
      link: tagihan.link,
    };
    await setup.notifications.jadwalkanChasing(input);
    const second = await setup.notifications.jadwalkanChasing(input);
    expect(second.dijadwalkan).toBe(0);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toHaveLength(4);
  });

  it("queues nothing for an order with no email (the H+1 escalation opens a call row instead)", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const jadwal = await setup.notifications.jadwalkanChasing({
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: null,
      email: null,
      perihal: "Pemakaman",
      total: tagihan.total,
      lewatJatuhTempoAt: anchorAt,
      link: tagihan.link,
    });
    expect(jadwal.dijadwalkan).toBe(0);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toHaveLength(0);
  });
});

describe("chasingEskalasiTick: the overdue list from H+1", () => {
  it("at H+1 opens one 'Telepon Pemesan' row and pushes that Lokasi's Admin Lokasi once; running it again changes nothing", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const lokasiAdmin = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");

    // Before H+1: nothing yet.
    setup.clock.set(wib("2026-10-02 07:59"));
    let hasil = await setup.notifications.chasingEskalasiTick(setup.clock.now());
    expect(hasil.dieskalasi).toBe(0);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);

    // H+1: the call row opens and the push goes out.
    setup.clock.set(wib("2026-10-02 08:00"));
    hasil = await setup.notifications.chasingEskalasiTick(setup.clock.now());
    expect(hasil.dieskalasi).toBe(1);
    const terbuka = await setup.notifications.teleponPemesanTerbuka();
    expect(terbuka).toEqual([
      expect.objectContaining({ subjectKind: "tagihan", subjectId: tagihan.id, sebab: "tagihan_lewat_jatuh_tempo", lokasiId: LOKASI_ID }),
    ]);
    const pesanStaf = await setup.notifications.pesanStaf(lokasiAdmin.accountId);
    expect(pesanStaf.filter((m) => m.template === "staf_tagihan_lewat_jatuh_tempo")).toHaveLength(1); // email (no Perangkat Push registered)

    // Running it again (or after the row later reopens for an H+14 call) never re-pushes.
    hasil = await setup.notifications.chasingEskalasiTick(setup.clock.now());
    expect(hasil.dieskalasi).toBe(0);
    expect((await setup.notifications.pesanStaf(lokasiAdmin.accountId)).filter((m) => m.template === "staf_tagihan_lewat_jatuh_tempo")).toHaveLength(1);
  });

  it("the overdue list expects several calls over time: logging the first call closes its row, and a later call opens a fresh one for the same Tagihan", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");

    setup.clock.set(wib("2026-10-02 08:00")); // H+1
    await setup.notifications.chasingEskalasiTick(setup.clock.now());
    const [firstCall] = await setup.notifications.teleponPemesanTerbuka();
    const closed = await setup.notifications.catatPanggilan(admin, { teleponId: firstCall!.id, hasil: "janji_bayar" });
    expect(closed.ok).toBe(true);

    // Around H+14, a staff member calls again on the same subject: a fresh open row.
    const reopened = { subjectKind: "tagihan", subjectId: tagihan.id } as const;
    expect(await setup.notifications.teleponPemesanTercatat(reopened.subjectKind, reopened.subjectId)).toBe(true);

    const riwayat = await setup.notifications.teleponPemesanRiwayat("tagihan", tagihan.id);
    expect(riwayat).toHaveLength(1);
    expect(riwayat[0]).toMatchObject({ hasil: "janji_bayar", ditutupPada: expect.any(Date) });
  });
});
