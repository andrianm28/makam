/**
 * Chasing's Pemesanan-side seam (spec, Billing > Chasing; ticket 29's AC 6, 7):
 * the block query on a Hak Pakai, ending one once its Saat Duka Tagihan is
 * Tidak Tertagih, and the moment recording a burial schedules the four family
 * reminders.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { lewatJatuhTempoPayAfterTagihanTick } from "@/domain/billing";
import { tagihan as tagihanTable } from "@/domain/billing/schema";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed Saat Duka order, ready to be recorded as buried. */
async function pesananDikonfirmasi(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: cells[0]!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
  if (!order?.tagihanId) throw new Error("no Tagihan on the confirmed order");
  const hakPakaiId = await setup.pemesanan.hakPakaiIdForTagihan(order.tagihanId);
  if (!hakPakaiId) throw new Error("no Hak Pakai on the confirmed order");
  return { ...fixture, nomor: placed.pemesanan.nomor, tagihanId: order.tagihanId, hakPakaiId };
}

/** Marks a Tagihan's status directly (a stand-in for the tick / `declareTidakTertagih`, both tested at their own layer). */
async function setStatus(tagihanId: string, status: "lewat_jatuh_tempo" | "tidak_tertagih" | "lunas", lewatJatuhTempoAt?: Date) {
  await db.update(tagihanTable).set({ status, ...(lewatJatuhTempoAt ? { lewatJatuhTempoAt } : {}) }).where(eq(tagihanTable.id, tagihanId));
}

describe("catatPemakaman schedules Chasing the moment the overdue anchor is known", () => {
  it("announces `chasingDijadwalkan` with the recorded burial's anchor, never the planned one", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-06 08:00")); // buried 4 days late
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(dicatat.ok).toBe(true);

    expect(setup.chasingDijadwalkan).toHaveLength(1);
    expect(setup.chasingDijadwalkan[0]).toMatchObject({
      tagihanId: fixture.tagihanId,
      // 72 h payment window after the recorded burial (2026-10-06 08:00), not the planned one (2026-10-02).
      lewatJatuhTempoAt: wib("2026-10-09 08:00"),
    });
  });
});

describe("isBlockedByOverdueTagihan", () => {
  it("is true only while the Saat Duka Tagihan is Lewat Jatuh Tempo, false once Lunas or Tidak Tertagih", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    expect(await setup.pemesanan.isBlockedByOverdueTagihan(fixture.hakPakaiId)).toBe(false);

    await setStatus(fixture.tagihanId, "lewat_jatuh_tempo", wib("2026-10-05 10:00"));
    expect(await setup.pemesanan.isBlockedByOverdueTagihan(fixture.hakPakaiId)).toBe(true);

    await setStatus(fixture.tagihanId, "tidak_tertagih", wib("2026-10-05 10:00"));
    expect(await setup.pemesanan.isBlockedByOverdueTagihan(fixture.hakPakaiId)).toBe(false);
  });

  it("is false for a Hak Pakai with no Saat Duka order at all", async () => {
    const setup = pemesananOnTestDatabase(db);
    expect(await setup.pemesanan.isBlockedByOverdueTagihan("00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("akhiriHakPakaiTidakTertagih", () => {
  it("refuses before the Tagihan is Tidak Tertagih", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    await setStatus(fixture.tagihanId, "lewat_jatuh_tempo", wib("2026-10-05 10:00"));
    const hasil = await setup.pemesanan.akhiriHakPakaiTidakTertagih(fixture.adminLokasi, { hakPakaiId: fixture.hakPakaiId });
    expect(hasil).toMatchObject({ ok: false, reason: "tagihan_belum_tidak_tertagih" });
  });

  it("refuses Admin Platform: only the Lokasi Mitra's own Admin Lokasi may end its Hak Pakai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    await setStatus(fixture.tagihanId, "tidak_tertagih", wib("2026-10-05 10:00"));
    const hasil = await setup.pemesanan.akhiriHakPakaiTidakTertagih(fixture.admin, { hakPakaiId: fixture.hakPakaiId });
    expect(hasil).toMatchObject({ ok: false, reason: "tidak_berwenang" });
  });

  it("the Lokasi's own Admin Lokasi ends the Hak Pakai (Berakhir) once the Tagihan is Tidak Tertagih", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    await setStatus(fixture.tagihanId, "tidak_tertagih", wib("2026-10-05 10:00"));
    const hasil = await setup.pemesanan.akhiriHakPakaiTidakTertagih(fixture.adminLokasi, { hakPakaiId: fixture.hakPakaiId, alasan: "Tidak Tertagih" });
    expect(hasil).toMatchObject({ ok: true, hakPakaiId: fixture.hakPakaiId });

    // Ending is final: doing it again is refused.
    const again = await setup.pemesanan.akhiriHakPakaiTidakTertagih(fixture.adminLokasi, { hakPakaiId: fixture.hakPakaiId });
    expect(again).toMatchObject({ ok: false, reason: "hak_pakai_sudah_berakhir" });
  });

  it("hakPakaiIdForTagihan finds the Saat Duka grant order's own Hak Pakai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    expect(await setup.pemesanan.hakPakaiIdForTagihan(fixture.tagihanId)).toBe(fixture.hakPakaiId);
  });
});

describe("nyatakanTidakTertagih: one transaction for the status, its Entri Audit and the queued Admin Lokasi push", () => {
  /** Buried on 2026-10-06 08:00, Lewat Jatuh Tempo from 10-09 08:00, called once at H+1 (10-10). */
  async function dikejar(setup: PemesananSetup) {
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-06 08:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(dicatat.ok).toBe(true);
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-09 08:00"));
    setup.clock.set(wib("2026-10-10 08:00"));
    await setup.notifications.chasingEskalasiTick(setup.clock.now());
    const [panggilan] = await setup.notifications.teleponPemesanTerbuka();
    const dicatatPanggilan = await setup.notifications.catatPanggilan(fixture.admin, { teleponId: panggilan!.id, hasil: "menolak" });
    expect(dicatatPanggilan.ok).toBe(true);
    return fixture;
  }

  it("is refused before H+30, and for the Lokasi's Admin Lokasi, who cannot declare it at all", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await dikejar(setup);

    setup.clock.set(wib("2026-11-07 08:00")); // H+29
    expect(await setup.pemesanan.nyatakanTidakTertagih(fixture.admin, { tagihanId: fixture.tagihanId })).toMatchObject({
      ok: false,
      reason: "belum_h30",
    });
    setup.clock.set(wib("2026-11-08 08:00")); // H+30
    expect(await setup.pemesanan.nyatakanTidakTertagih(fixture.adminLokasi, { tagihanId: fixture.tagihanId })).toMatchObject({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "lewat_jatuh_tempo" });
    expect(await setup.audit.entriesAbout({ kind: "tagihan", id: fixture.tagihanId })).toEqual([]);
  });

  it("at H+30 after a logged call: Tidak Tertagih, an Entri Audit with before/after and reason, and one push for the Admin Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await dikejar(setup);
    setup.clock.set(wib("2026-11-08 08:00"));

    const hasil = await setup.pemesanan.nyatakanTidakTertagih(fixture.admin, { tagihanId: fixture.tagihanId, alasan: "Keluarga menolak membayar" });
    expect(hasil).toMatchObject({ ok: true, tagihan: { status: "tidak_tertagih" } });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "tidak_tertagih" });

    expect(await setup.audit.entriesAbout({ kind: "tagihan", id: fixture.tagihanId })).toEqual([
      expect.objectContaining({
        action: "tagihan.tidak_tertagih",
        before: { status: "lewat_jatuh_tempo" },
        after: expect.objectContaining({ status: "tidak_tertagih" }),
        reason: "Keluarga menolak membayar",
      }),
    ]);

    // The push was queued with the declaration; the worker's tick delivers it, once.
    const tidakTertagih = async () =>
      (await setup.notifications.pesanStaf(fixture.adminLokasi.accountId)).filter((m) => m.template === "staf_tagihan_tidak_tertagih");
    expect(await tidakTertagih()).toHaveLength(0);
    await setup.notifications.chasingEskalasiTick(setup.clock.now());
    await setup.notifications.chasingEskalasiTick(setup.clock.now());
    expect(await tidakTertagih()).toHaveLength(1);

    // And the Admin Lokasi may now end the Hak Pakai.
    expect(await setup.pemesanan.akhiriHakPakaiTidakTertagih(fixture.adminLokasi, { hakPakaiId: fixture.hakPakaiId })).toMatchObject({ ok: true });
  });
});
