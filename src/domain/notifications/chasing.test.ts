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

    expect(await setup.notifications.teleponPemesanTercatat("tagihan", tagihan.id)).toBe(true);
    // Not yet H+14 (spec: "around H+1 and around H+14"): no second row.
    setup.clock.set(wib("2026-10-14 08:00")); // H+13
    expect((await setup.notifications.chasingEskalasiTick(setup.clock.now())).dieskalasi).toBe(0);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);

    // H+14: the second call row opens, once, and does not push the Admin Lokasi again.
    setup.clock.set(wib("2026-10-15 08:00"));
    expect((await setup.notifications.chasingEskalasiTick(setup.clock.now())).dieskalasi).toBe(1);
    expect((await setup.notifications.chasingEskalasiTick(setup.clock.now())).dieskalasi).toBe(0);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([expect.objectContaining({ sebab: "tagihan_lewat_jatuh_tempo" })]);

    const riwayat = await setup.notifications.teleponPemesanRiwayat("tagihan", tagihan.id);
    expect(riwayat).toHaveLength(2);
    expect(riwayat[0]).toMatchObject({ hasil: "janji_bayar", ditutupPada: expect.any(Date) });
  });

  it("calls are asked for only inside 08:00–20:00 WIB: H+1 at 21:00 waits for the next 08:00", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);

    setup.clock.set(wib("2026-10-02 21:00"));
    expect((await setup.notifications.chasingEskalasiTick(setup.clock.now())).dieskalasi).toBe(0);
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);

    setup.clock.set(wib("2026-10-03 08:00"));
    expect((await setup.notifications.chasingEskalasiTick(setup.clock.now())).dieskalasi).toBe(1);
  });

  it("a tick that dies while pushing loses nothing: the row and the queued push committed together, and the next run sends", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const lokasiAdmin = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");

    const asli = setup.identity.adminLokasiOf;
    setup.identity.adminLokasiOf = async () => {
      throw new Error("identity down");
    };
    setup.clock.set(wib("2026-10-02 08:00"));
    await expect(setup.notifications.chasingEskalasiTick(setup.clock.now())).rejects.toThrow("identity down");
    setup.identity.adminLokasiOf = asli;

    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);
    expect(await setup.notifications.pesanStaf(lokasiAdmin.accountId)).toHaveLength(0);

    // The lease the failed run took has to lapse, then the same tick sends it.
    setup.clock.set(wib("2026-10-02 08:11"));
    await setup.notifications.chasingEskalasiTick(setup.clock.now());
    expect((await setup.notifications.pesanStaf(lokasiAdmin.accountId)).filter((m) => m.template === "staf_tagihan_lewat_jatuh_tempo")).toHaveLength(1);
    expect(await setup.notifications.teleponPemesanRiwayat("tagihan", tagihan.id)).toHaveLength(1);
  });
});

describe("tambahCatatanTagihan: a standalone note on the call log", () => {
  it("the Lokasi's own Admin Lokasi adds one without any open call row, and it is never a call", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const lokasiAdmin = await invitedStaff(setup, admin, "admin_lokasi", "admin.lokasi@contoh.id");

    const hasil = await setup.notifications.tambahCatatanTagihan(lokasiAdmin, { tagihanId: tagihan.id, catatan: "Keluarga minta dihubungi sore hari." });
    expect(hasil).toMatchObject({ ok: true, catatan: { catatan: "Keluarga minta dihubungi sore hari." } });
    expect(await setup.notifications.catatanTagihan(tagihan.id)).toHaveLength(1);
    // A note is not a call: no row was opened, none closed, and Tidak Tertagih's "a call was logged" stays false.
    expect(await setup.notifications.teleponPemesanRiwayat("tagihan", tagihan.id)).toEqual([]);
    expect(await setup.notifications.teleponPemesanTercatat("tagihan", tagihan.id)).toBe(false);
    const entries = await setup.audit.entriesAbout({ kind: "tagihan", id: tagihan.id });
    expect(entries).toEqual([expect.objectContaining({ action: "tagihan.catatan_ditambah" })]);
  });

  it("refuses another Lokasi's Admin Lokasi", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const anchorAt = wib("2026-10-01 08:00");
    setup.clock.set(anchorAt);
    const tagihan = await issueSaatDuka(setup, wib("2026-09-28 08:00"));
    await anchor(tagihan.id, anchorAt);
    const lain = await invitedStaff(setup, admin, "admin_lokasi", "lain@contoh.id");
    // The fixture's Admin Lokasi are all invited for one Lokasi; move this one to another.
    const orang = { ...lain, lokasiIds: ["5d1f4c2e-0000-4000-8000-000000000099"] };
    const hasil = await setup.notifications.tambahCatatanTagihan(orang, { tagihanId: tagihan.id, catatan: "x" });
    expect(hasil).toMatchObject({ ok: false, reason: "tidak_berwenang" });
  });
});
