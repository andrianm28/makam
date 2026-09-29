import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { scheduledTicks } from "@/domain/scheduler";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  petakPerluVerifikasi,
  pemesanLayanan,
  siapkanOperatorLayanan,
  type LayananSetup,
  type LokasiDenganLayanan,
} from "../../../tests/support/layanan";

/**
 * Ordering Layanan for a grave at a Lokasi Mitra (spec, Layanan > Order; stories 84
 * and 86). Every assertion goes through the module's public interface: the
 * checkout's read, the order, the Tagihan Billing issued, and what the Pemesan
 * reads back. Nothing reads a table.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB, so "today" in every
 * date rule below is that day, and a Pembersihan Makam has a 3-day lead time
 * unless a test says otherwise.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Lokasi offering one Layanan, a grave on it held by somebody else, and a family to order. */
async function siap(options: Parameters<typeof lokasiDenganLayanan>[1] = {}, notifikasiNyata = false) {
  const setup = layananOnTestDatabase(db, { notifikasiNyata });
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, options);
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  return { setup, lokasi, petak, pemesan };
}

/** What the checkout sends for one Layanan on that grave, as a relative (never the Pemegang Hak) does. */
function kirim(
  pemesan: { accountId: string; email: string },
  lokasi: LokasiDenganLayanan,
  petakId: string,
  varianId: string,
  targetDate: string,
  teks: string | null = null,
) {
  return {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId,
    item: [{ layananVariantId: varianId, targetDate, teks }],
  };
}

/** Pays a Tagihan the way the Admin Platform's manual payment does, at `paidAt`. */
async function bayar(setup: LayananSetup, tagihanId: string, paidAt: Date) {
  return setup.billing.recordPayment(tagihanId, { method: { kind: "transfer_manual" }, reference: null, paidAt });
}

describe("the Layanan a Lokasi Mitra offers for an order", () => {
  it("are the ones it switched on, each variant at its own price", async () => {
    const { setup, lokasi } = await siap();
    const marmer = await setup.layanan.tambahVarian(lokasi.admin, lokasi.layanan.id, { name: "Marmer 80 cm", reason: null });
    if (!marmer.ok) throw new Error("varian refused");
    const ditawarkan = await setup.layanan.tawarkanLayanan(lokasi.admin, lokasi.lokasiMitra.id, marmer.varian.id, {
      amount: 900_000,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    if (!ditawarkan.ok) throw new Error("offering refused");

    const penawaran = await setup.layanan.penawaranUntukPesanan(lokasi.lokasiMitra.id);
    expect(penawaran).toHaveLength(1);
    expect(penawaran[0].layanan).toMatchObject({ name: "Pembersihan Makam", leadTimeDays: 3, proof: { fotoSesudah: true, fotoSebelum: true } });
    // The variant's own price, not an all-in total: a Tagihan carries one Biaya
    // Layanan Platform however many items it holds, so a per-item total would
    // charge that fee once per item and the bill would not match the screen.
    expect(penawaran[0].varian.map((satu) => [satu.name, satu.harga])).toEqual([
      ["Marmer 80 cm", 900_000],
      ["Reguler", 750_000],
    ]);
  });

  it("prices a chosen set all in: the items plus exactly one Biaya Layanan Platform", async () => {
    const { setup, lokasi } = await siap({ amount: 750_000 });
    const harga = await setup.layanan.hargaPesananLayanan(lokasi.lokasiMitra.id, [lokasi.varian.id]);
    expect(harga).toMatchObject({ total: 900_000, platformFee: 150_000 });
    expect(harga?.parts).toEqual([
      { label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000, layananVariantId: lokasi.varian.id },
      { label: "Biaya Layanan Platform", amount: 150_000, layananVariantId: null },
    ]);
    // A variant that place does not offer has no price, so the screen shows nothing
    // rather than a number nobody could be charged.
    expect(await setup.layanan.hargaPesananLayanan(lokasi.lokasiMitra.id, ["00000000-0000-4000-8000-000000000000"])).toBeNull();
  });
});

describe("placing an order Layanan", () => {
  it("is due at the earlier of 24 h after issue and the last lead-time day", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({ leadTimeDays: 3, amount: 750_000 });
    // A target far enough ahead that 24 h after issue is the earlier of the two.
    const jauh = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!jauh.ok) throw new Error("order refused");
    expect(jauh.tagihan.kind).toBe("pay_first");
    expect(jauh.tagihan.total).toBe(900_000);
    expect(jauh.tagihan.dueAt).toEqual(wib("2026-10-02 09:00"));
    expect(jauh.pesanan.status).toBe("menunggu_pembayaran");

    const tagihan = await setup.billing.tagihan(jauh.tagihan.id);
    expect(tagihan?.lines).toEqual([
      {
        kind: "layanan",
        label: "Layanan – Pembersihan Makam (Reguler)",
        amount: 750_000,
        provider: { kind: "lokasi_mitra", lokasiId: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
        targetDate: "2026-10-20",
        leadTimeDays: 3,
      },
      { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: 150_000, provider: { kind: "operator" } },
    ]);
  });

  it("is due at the last lead-time day when that falls before 24 h after issue", async () => {
    // A one-day lead time on a target the very next day: the last day the Lokasi has
    // to prepare is tonight, which is earlier than 24 h after issue.
    const { setup, lokasi, petak, pemesan } = await siap({ leadTimeDays: 1 });
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-02"));
    if (!hasil.ok) throw new Error("order refused");
    expect(hasil.tagihan.dueAt).toEqual(wib("2026-10-01 23:59"));
  });

  it("refuses a target date inside the Layanan's lead time", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({ leadTimeDays: 5 });
    // Today is the 1st, so with a 5-day lead time the earliest date is the 6th.
    expect(await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-05"))).toEqual({
      ok: false,
      reason: "lead_time_melewati",
    });
    const tepat = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-06"));
    expect(tepat.ok).toBe(true);
  });

  it("carries the text its Layanan asks for, and refuses it empty", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({ jenis: "nisan", nama: "Batu Nisan", teksLabel: "Teks nisan" });
    expect(await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"))).toEqual({
      ok: false,
      reason: "teks_kosong",
    });

    const hasil = await setup.layanan.placePesananLayanan(
      pemesan,
      kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20", "Requiescat in pace"),
    );
    if (!hasil.ok) throw new Error("order refused");
    const dibaca = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].teks).toBe("Requiescat in pace");
  });

  it("is refused for a Hak Pakai that has ended, and for a grave that is not there", async () => {
    const { setup, lokasi, petak, pemesan } = await siap();
    // The Admin Lokasi's "end a Hak Pakai by hand" is the Inventory module's later
    // ticket, so no public function can reach `berakhir` yet. The rule under test
    // is the order's, and the state is put on the row to reach it; the assertion
    // itself reads the order's own refusal, never the row.
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'berakhir', end_reason = 'Selesai' where id = ${petak.hakPakaiId}`);
    expect(await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"))).toEqual({
      ok: false,
      reason: "hak_pakai_berakhir",
    });

    // The other Petak of the same Lokasi has no Hak Pakai at all, so it is not a grave to order for.
    const lain = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, lokasi.petak[1].id, lokasi.varian.id, "2026-10-20"));
    expect(lain).toEqual({ ok: false, reason: "grave_tidak_ditemukan" });
  });

  it("may still take another Layanan on a Hak Pakai that has been given back, and only Berakhir refuses", async () => {
    const { setup, lokasi, petak, pemesan } = await siap();
    // **The owner's settled decision, not this module's reading.** AC 1 names only
    // Berakhir; this module used to refuse `dibatalkan` here as well, and the owner
    // chose the AC. The asymmetry decided it: with a one-way block, **one** failed
    // service prevents **every other** service the family has already paid for, which
    // is the wrong way round for a family that has committed money. So an order whose
    // one job was cancelled may still take another Layanan, and this test holds the
    // order **open** — the one that matters, because a test that only refused would
    // have passed under either behaviour and proved nothing about the decision.
    //
    // The write is a stand-in for the same reason as `berakhir` above: the Inventory
    // flow that gives a Hak Pakai back (ticket 39) is not built yet.
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'dibatalkan', end_reason = 'Dikembalikan' where id = ${petak.hakPakaiId}`);
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
    // It is a real order on a real Tagihan, not a shrug: it issues, it is priced, and
    // the Pemesan reads it back as their own.
    const dibaca = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(dibaca).toMatchObject({ status: "menunggu_pembayaran", total: 900_000, petak: { nomor: petak.nomor } });

    // And the rule is still exactly one block: `berakhir` refuses, and it refuses with
    // the same reason, so the screen's one message covers the only state that blocks.
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'berakhir', end_reason = 'Selesai' where id = ${petak.hakPakaiId}`);
    expect(await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"))).toEqual({
      ok: false,
      reason: "hak_pakai_berakhir",
    });
  });

  it("reads which graves are open from one read, so the screen and the order cannot disagree", async () => {
    const { setup, lokasi, petak } = await siap();
    // `cekHakPakai` is the single rule both the checkout screen and `placePesananLayanan`
    // decide on, so this is the test that holds one status open and one shut. The screen
    // used to carry its own copy of the rule and the two drifted; there is no longer a
    // second copy to drift.
    const terbuka = await setup.layanan.cekHakPakai(lokasi.lokasiMitra.id, petak.petakId);
    expect(terbuka).toMatchObject({ ok: true, petak: { nomor: petak.nomor }, hak: { perluVerifikasi: false } });

    // A grave that is not there is not a grave, whatever the status says.
    expect(await setup.layanan.cekHakPakai(lokasi.lokasiMitra.id, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      reason: "grave_tidak_ditemukan",
    });

    // **The owner's settled decision, read through the one read:** a given-back Hak Pakai
    // is still a grave a family may order another Layanan for. `berakhir` is the only
    // state that shuts it, which is what AC 1 names.
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'dibatalkan', end_reason = 'Dikembalikan' where id = ${petak.hakPakaiId}`);
    expect(await setup.layanan.cekHakPakai(lokasi.lokasiMitra.id, petak.petakId)).toMatchObject({ ok: true });
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'berakhir', end_reason = 'Selesai' where id = ${petak.hakPakaiId}`);
    expect(await setup.layanan.cekHakPakai(lokasi.lokasiMitra.id, petak.petakId)).toEqual({
      ok: false,
      reason: "hak_pakai_berakhir",
    });

    // A flagged Hak Pakai is reported, not refused: the grave may be ordered for and the
    // job waits for the Admin Lokasi (AC 1's second half, and the gate's round trip).
    await setup.db.execute(sql`update inventory_hak_pakai set status = 'aktif', perlu_verifikasi = true where id = ${petak.hakPakaiId}`);
    expect(await setup.layanan.cekHakPakai(lokasi.lokasiMitra.id, petak.petakId)).toMatchObject({ ok: true, hak: { perluVerifikasi: true } });
  });

  it("charges the Biaya Layanan Platform once for an order of two Layanan, not once each", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({ amount: 750_000 });
    const kedua = await setup.layanan.tambahVarian(lokasi.admin, lokasi.layanan.id, { name: "Marmer 80 cm", reason: null });
    if (!kedua.ok) throw new Error("varian refused");
    const ditawarkan = await setup.layanan.tawarkanLayanan(lokasi.admin, lokasi.lokasiMitra.id, kedua.varian.id, {
      amount: 900_000,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    if (!ditawarkan.ok) throw new Error("offering refused");

    const hasil = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      item: [
        { layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null },
        { layananVariantId: kedua.varian.id, targetDate: "2026-10-22", teks: null },
      ],
    });
    if (!hasil.ok) throw new Error("order refused");

    // One fee, whatever the order holds: 750.000 + 900.000 + 150.000. A fee per item
    // would be 300.000, and the family would be charged twice for the same thing.
    const tagihan = await setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan?.lines.filter((satu) => satu.kind === "biaya_layanan_platform")).toHaveLength(1);
    expect(tagihan?.lines.map((satu) => [satu.kind, satu.amount])).toEqual([
      ["layanan", 750_000],
      ["layanan", 900_000],
      ["biaya_layanan_platform", 150_000],
    ]);
    expect(hasil.tagihan.total).toBe(1_800_000);
    // And two jobs, one per Layanan, each carrying its own target date.
    const dibaca = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(dibaca?.item.map((satu) => satu.targetDate)).toEqual(["2026-10-20", "2026-10-22"]);
  });

  it("names the Petak by the number the family knows, and the window the work may be done in", async () => {
    const { setup, lokasi, petak, pemesan } = await siap();
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error("order refused");
    expect(hasil.pesanan.nomor).toMatch(/^MKM-\d{4}-\d{6}$/);

    const dibaca = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(dibaca).toMatchObject({ lokasi: { name: lokasi.lokasiMitra.name }, petak: { nomor: petak.nomor }, total: 900_000 });
    // The target date is a window: two days either side of it.
    expect(dibaca?.item[0].jendela).toEqual({ dari: "2026-10-18", sampai: "2026-10-22" });
    // Nobody but the Pemesan who placed it may read it.
    expect(await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, { accountId: "00000000-0000-4000-8000-000000000000" })).toBeNull();
  });

  it("announces the order to the Pemesan with its Tagihan", async () => {
    const { setup, lokasi, petak, pemesan } = await siap();
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error("order refused");
    expect(setup.notifikasi.pesananTerbit).toEqual([
      {
        pesananId: hasil.pesanan.id,
        nomor: hasil.pesanan.nomor,
        email: pemesan.email,
        pemesanName: "Budi Santoso",
        lokasi: { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
        petak: { nomor: petak.nomor },
        item: [{ label: "Layanan – Pembersihan Makam (Reguler)", targetDate: "2026-10-20" }],
        tagihan: { id: hasil.tagihan.id, nomorTagihan: hasil.tagihan.nomorTagihan, total: 900_000, dueAt: hasil.tagihan.dueAt, link: hasil.tagihan.link },
      },
    ]);
  });

  it("announces its pay-first Tagihan through Notifications, with the H-1 and due-day reminder queued", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({}, true);
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error("order refused");

    const pesanTagihan = await setup.notifications.pesanTagihan(hasil.tagihan.id);
    // The Tagihan's own "terbit" email is folded into the order email (one email, not two).
    expect(pesanTagihan.map((pesan) => pesan.template)).not.toContain("tagihan_terbit");
    expect(pesanTagihan.map((pesan) => pesan.template)).toEqual(
      expect.arrayContaining(["tagihan_pengingat_hari_h"]),
    );
    // The order's own confirmation is the other message the family gets, and it is about the order.
    const pesanOrder = await setup.notifications.pesanLayanan(hasil.pesanan.nomor);
    expect(pesanOrder.map((pesan) => pesan.template)).toContain("layanan_pesanan_terbit");
  });

  it("sends exactly one email for an order: the order email carries both the Tagihan link and the order page", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({}, true);
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error("order refused");
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    // A reminder is a different kind of email; the order itself is announced by exactly one.
    const terkirim = setup.email.sent.filter((pesan) => pesan.to === pemesan.email && !pesan.subject.startsWith("Pengingat") && pesan.text.includes("/dokumen/"));
    expect(terkirim).toHaveLength(1);
    expect(terkirim[0].subject).not.toContain("telah terbit");
    expect(terkirim[0].text).toContain(`/dokumen/${hasil.tagihan.link}`);
    expect(terkirim[0].text).toContain(`/layanan/${hasil.pesanan.nomor}`);
    // The Tagihan's own "terbit" email is not queued, but its due-day reminder still is.
    const templates = (await setup.notifications.pesanTagihan(hasil.tagihan.id)).map((pesan) => pesan.template);
    expect(templates).not.toContain("tagihan_terbit");
    expect(templates).toContain("tagihan_pengingat_hari_h");
  });

  it("announces nothing when it refuses", async () => {
    const { setup, lokasi, petak, pemesan } = await siap({ leadTimeDays: 5 });
    const gagal = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-02"));
    expect(gagal.ok).toBe(false);
    // The announcement is the module's own visible effect, so a refusal that wrote
    // an order would show here even where no order page exists to read.
    expect(setup.notifikasi.pesananTerbit).toEqual([]);
  });
});

describe("paying for an order", () => {
  it("schedules one Pekerjaan Layanan per Layanan, at the moment the money arrived", async () => {
    const { setup, lokasi, petak, pemesan } = await siap();
    const hasil = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!hasil.ok) throw new Error("order refused");

    const sebelum = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(sebelum?.item[0].pekerjaan?.status).toBe("menunggu_pembayaran");

    // The payment is the whole trigger: Billing's own downstream effect schedules it.
    setup.clock.set(wib("2026-10-01 10:00"));
    expect((await bayar(setup, hasil.tagihan.id, wib("2026-10-01 10:00"))).ok).toBe(true);

    const sesudah = await setup.layanan.pesananLayananOf(hasil.pesanan.nomor, pemesan);
    expect(sesudah?.status).toBe("terbayar");
    expect(sesudah?.item[0].pekerjaan?.status).toBe("dijadwalkan");
  });

  it("schedules nothing for a Tagihan that is not this module's", async () => {
    const { setup, pemesan } = await siap();
    // The effect runs for every payment of every Tagihan, so a foreign one must be
    // ignored rather than mistake a Nomor Pesanan it does not own for one of ours.
    const lain = await setup.billing.issueTagihan({
      moment: { kind: "perpanjangan" },
      addressee: { name: "Budi Santoso", phoneNumber: "081234567890", accountId: pemesan.accountId },
      nomorPemesanan: "MKM-2026-999999",
      placeName: null,
      lines: [{ kind: "biaya_layanan_platform", label: "Biaya Layanan Platform (contoh)", amount: 150_000 as never, provider: { kind: "operator" } }],
    });
    if (!lain.ok) throw new Error(`tagihan refused: ${lain.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    expect((await bayar(setup, lain.tagihan.id, wib("2026-10-01 10:00"))).ok).toBe(true);
  });
});

/**
 * AC 1's second half: a Hak Pakai flagged Perlu Verifikasi **may be ordered for**,
 * but the money must not schedule its jobs until the Admin Lokasi has completed it.
 * A gate and its exit are one round trip, so these read the whole way round —
 * ordered, held, released, scheduled — not only the half where the gate holds.
 */
describe("a Hak Pakai the Admin Lokasi must still complete", () => {
  /** One order on a grave whose Hak Pakai came out flagged: the second Petak, cleared "data menyusul". */
  async function orderYangDiblokir() {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup);
    const petak = await petakPerluVerifikasi(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup);
    const order = await setup.layanan.placePesananLayanan(pemesan, kirim(pemesan, lokasi, petak.petakId, lokasi.varian.id, "2026-10-20"));
    if (!order.ok) throw new Error(`order refused: ${order.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    expect((await bayar(setup, order.tagihan.id, wib("2026-10-01 10:00"))).ok).toBe(true);
    return { setup, lokasi, petak, pemesan, order };
  }

  it("holds the job when the money arrives, though the Tagihan is Lunas", async () => {
    const { setup, lokasi, pemesan, order } = await orderYangDiblokir();

    // The payment itself succeeded and the order is Terbayar; only the work is held,
    // which is exactly what "completed before the first Layanan is scheduled" means.
    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca).toMatchObject({ status: "terbayar", item: [{ pekerjaan: { status: "menunggu_pembayaran" } }] });
    // And the Admin Lokasi is told which order is waiting, so the hold is not silence.
    expect(await setup.layanan.pesananTertunda()).toMatchObject([
      { nomor: order.pesanan.nomor, lokasiId: lokasi.lokasiMitra.id, petakNomor: lokasi.petak[1].nomorMakam },
    ]);
  });

  it("is released by the Admin Lokasi completing it, and the job the money paid for is then scheduled", async () => {
    const { setup, lokasi, petak, pemesan, order } = await orderYangDiblokir();

    // **The exit.** Only the Admin Lokasi of that plot's own Lokasi Mitra may complete
    // its Hak Pakai: the Operator chases a Lokasi by phone (story 117) and does not
    // stand at the grave, so it is refused here.
    expect(await setup.inventory.selesaikanVerifikasiHakPakai(lokasi.admin, lokasi.lokasiMitra.id, { hakPakaiId: petak.hakPakaiId })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.inventory.selesaikanVerifikasiHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId: petak.hakPakaiId })).toEqual({ ok: true });
    // Twice is refused rather than quietly accepted: the flag is off, so there is
    // nothing left to complete.
    expect(await setup.inventory.selesaikanVerifikasiHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, { hakPakaiId: petak.hakPakaiId })).toEqual({
      ok: false,
      reason: "tidak_perlu_verifikasi",
    });

    // The worker's tick is what notices the right is now complete, and it moves the
    // job the money already paid for. Idempotent, as every tick is.
    setup.clock.set(wib("2026-10-01 11:00"));
    expect(await setup.layanan.jadwalkanTertunda(setup.clock.now())).toBe(1);
    expect(await setup.layanan.jadwalkanTertunda(setup.clock.now())).toBe(0);
    expect(await setup.layanan.pesananTertunda()).toEqual([]);
    // The whole round trip ends where an ordinary paid order does.
    expect(await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan)).toMatchObject({
      status: "terbayar",
      item: [{ pekerjaan: { status: "dijadwalkan" } }],
    });
  });

  it("is the tick the worker runs, so nothing has to be released by hand", async () => {
    const { setup, lokasi, petak } = await orderYangDiblokir();
    // The staff screen knows only the grave, so it names the Petak and Inventory finds the Hak Pakai.
    expect(await setup.inventory.selesaikanVerifikasiHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, { petakId: petak.petakId })).toEqual({ ok: true });

    const tick = scheduledTicks.find((scheduled) => scheduled.name === "layanan.jadwalkan_tertunda");
    if (!tick) throw new Error("the worker does not schedule the tick that releases a held job");
    setup.clock.set(wib("2026-10-01 11:00"));
    await tick.tick({ db: setup.db, inventory: setup.inventory } as never, setup.clock.now());
    expect(await setup.layanan.pesananTertunda()).toEqual([]);
  });
});
