import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, mitraJasaLengkap, type LayananSetup } from "../../../tests/support/layanan";
import {
  HARGA_BUNGA_TABUR,
  HARGA_PEMBERSIHAN,
  mitraJasaUntuk,
  orderTpu,
  saatDukaTpuDikonfirmasi,
  siapTpu,
} from "../../../tests/support/layanan-tpu";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { batasJawabPenugasan } from "./penugasan-tpu";

/**
 * Layanan at a DKI TPU, fulfilled by a Mitra Jasa (spec, Layanan; stories 23, 85,
 * 156, 176, 178; ticket 56). Every assertion goes through a module's public
 * interface: the order, the Tagihan Billing issued, the picker, what the Pemesan and
 * the Mitra Jasa each read back, the Antrean's rows and the scorecard.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A TPU with its Layanan and prices, and a Mitra Jasa who covers the Bunga Tabur there. */
async function siap(options: { notifikasiNyata?: boolean } = {}) {
  const setup = layananOnTestDatabase(db, { pekerjaanNyata: true, ...options });
  const tpuSiap = await siapTpu(setup);
  return { setup, ...tpuSiap };
}

/** Pays a Tagihan the way the Admin Platform's manual payment does. */
async function bayar(setup: LayananSetup, tagihanId: string, paidAt: Date) {
  const hasil = await setup.billing.recordPayment(tagihanId, { method: { kind: "transfer_manual" }, reference: null, paidAt });
  if (!hasil.ok) throw new Error("payment refused");
}

/** A standalone TPU order for one Bunga Tabur, paid, so its job is Dijadwalkan. Returns its job. */
async function pekerjaanBunga(s: Awaited<ReturnType<typeof siap>>, targetDate = "2026-10-05") {
  const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate }]));
  if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
  await bayar(s.setup, dipesan.tagihan.id, s.setup.clock.now());
  const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
  return { job, nomor: dipesan.pesanan.nomor, tagihanId: dipesan.tagihan.id };
}

describe("an order Layanan at a DKI TPU by describing the grave", () => {
  it("is priced at the DKI price with no Biaya Layanan Platform, on a pay-first Tagihan, and needs no Makam TPU", async () => {
    const s = await siap();

    const hasil = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-20" }]));
    if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);

    expect(hasil.pesanan.status).toBe("menunggu_pembayaran");
    // The DKI price alone: a TPU is the Operator's own, and the platform fee is a Lokasi Mitra order's.
    expect(hasil.tagihan).toMatchObject({ kind: "pay_first", total: HARGA_BUNGA_TABUR });
    // Due at the earlier of 24 h after issue and the last lead-time day, as a standalone Layanan Tagihan is.
    expect(hasil.tagihan.dueAt).toEqual(wib("2026-10-02 09:00"));
    const tagihan = await s.setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan?.lines).toEqual([
      {
        kind: "layanan",
        label: "Layanan – Bunga Tabur (Reguler)",
        amount: HARGA_BUNGA_TABUR,
        provider: { kind: "operator" },
        targetDate: "2026-10-20",
        leadTimeDays: 1,
      },
    ]);

    // The grave is what the family described; there is no Makam TPU behind it.
    const order = await s.setup.layanan.pesananTpuOf(hasil.pesanan.nomor, s.pemesan);
    expect(order).toMatchObject({
      sumber: "pesanan_tpu",
      tpu: { id: s.tpu.id, name: "TPU Kober" },
      makam: { blokNomor: "Blok C-7 No. 21", almarhumName: "Hasan Basri", keterangan: "Dekat pohon kamboja", adaFoto: false, pin: { lat: -6.2001, lng: 106.9001 } },
      total: HARGA_BUNGA_TABUR,
      item: [{ label: "Layanan – Bunga Tabur (Reguler)", status: "menunggu_pembayaran", targetDate: "2026-10-20", mitraJasa: null }],
    });
    // Nobody else's order.
    expect(await s.setup.layanan.pesananTpuOf(hasil.pesanan.nomor, { accountId: "00000000-0000-4000-8000-000000000000" })).toBeNull();
  });

  it("keeps an optional photo of the grave, and refuses a file that is not a photo", async () => {
    const s = await siap();
    const jpeg = { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };

    const denganFoto = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-20" }]), jpeg);
    if (!denganFoto.ok) throw new Error(`order refused: ${denganFoto.reason}`);
    expect((await s.setup.layanan.pesananTpuOf(denganFoto.pesanan.nomor, s.pemesan))?.makam.adaFoto).toBe(true);

    const bukanFoto = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-20" }]), {
      body: new TextEncoder().encode("bukan foto"),
      contentType: "image/jpeg",
    });
    expect(bukanFoto).toEqual({ ok: false, reason: "foto_tidak_didukung" });
  });

  it("refuses a variant no TPU offers, a date inside the lead time, and a Layanan with a missing text", async () => {
    const s = await siap();
    const tidakDitandai = await s.setup.layanan.tambahVarian(s.admin, (await s.setup.layanan.katalog()).find((satu) => satu.name === "Bunga Tabur")!.id, {
      name: "Mawar",
      reason: null,
    });
    if (!tidakDitandai.ok) throw new Error("varian refused");

    // A variant Admin Platform did not mark "boleh di TPU DKI", however priced.
    expect(await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: tidakDitandai.varian.id, targetDate: "2026-10-20" }]))).toEqual({
      ok: false,
      reason: "layanan_tidak_tersedia",
    });
    // Pembersihan has a 3-day lead time: the 1st plus three is the 4th.
    expect(await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.pembersihan.id, targetDate: "2026-10-03" }]))).toEqual({
      ok: false,
      reason: "lead_time_melewati",
    });
    expect((await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.pembersihan.id, targetDate: "2026-10-04" }]))).ok).toBe(true);
  });

  it("schedules its jobs when the Tagihan is paid, and not before", async () => {
    const s = await siap();
    const dipesan = await s.setup.layanan.placePesananLayananTpu(
      s.pemesan,
      orderTpu(s, [
        { layananVariantId: s.bunga.id, targetDate: "2026-10-05" },
        { layananVariantId: s.pembersihan.id, targetDate: "2026-10-06" },
      ]),
    );
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    expect(dipesan.tagihan.total).toBe(HARGA_BUNGA_TABUR + HARGA_PEMBERSIHAN);
    const sebelum = await s.setup.layanan.pesananTpuOf(dipesan.pesanan.nomor, s.pemesan);
    expect(sebelum?.item.map((satu) => satu.status)).toEqual(["menunggu_pembayaran", "menunggu_pembayaran"]);
    // Nothing is promised to a Mitra Jasa that money has not arrived for.
    expect(await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).toEqual([]);

    await bayar(s.setup, dipesan.tagihan.id, s.setup.clock.now());

    const sesudah = await s.setup.layanan.pesananTpuOf(dipesan.pesanan.nomor, s.pemesan);
    expect(sesudah?.item.map((satu) => satu.status)).toEqual(["dijadwalkan", "dijadwalkan"]);
    expect((await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).map((satu) => satu.label)).toEqual([
      "Layanan – Bunga Tabur (Reguler)",
      "Layanan – Pembersihan Makam (Reguler)",
    ]);
  });

  it("sends exactly one email for an order, carrying the Tagihan link and the order page, and names no Lokasi Mitra", async () => {
    const s = await siap({ notifikasiNyata: true });
    const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-20" }]));
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    await s.setup.notifications.kirimPesanJatuhTempo(s.setup.clock.now());

    const terkirim = s.setup.email.sent.filter((pesan) => pesan.to === s.pemesan.email && pesan.text.includes("/dokumen/"));
    expect(terkirim).toHaveLength(1);
    expect(terkirim[0].text).toContain(`/dokumen/${dipesan.tagihan.link}`);
    expect(terkirim[0].text).toContain(`/layanan/${dipesan.pesanan.nomor}`);
    expect(terkirim[0].text).toContain("TPU Kober");
    // The Tagihan's own "terbit" email is folded in, but its due-day reminder is still queued.
    const templates = (await s.setup.notifications.pesanTagihan(dipesan.tagihan.id)).map((pesan) => pesan.template);
    expect(templates).not.toContain("tagihan_terbit");
    expect(templates).toContain("tagihan_pengingat_hari_h");
  });
});

describe("hari-H Layanan on a Saat Duka TPU order", () => {
  it("stay pay-after on the Saat Duka TPU Tagihan and are Dijadwalkan at the confirmation, targeted at the burial day", async () => {
    const s = await siap();
    const { nomor, hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, [{ layananVariantId: s.bunga.id }]);

    // One Tagihan: the burial's two lines and the hari-H item, due 3×24 h after the burial like the rest of it.
    expect(hasil.tagihan).toMatchObject({ total: 1_750_000 + HARGA_BUNGA_TABUR, dueAt: wib("2026-10-05 09:00") });
    const tagihan = await s.setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan?.kind).toBe("pay_after");
    expect(tagihan?.lines.map((baris) => baris.kind)).toEqual(["biaya_pengurusan", "retribusi_pemda", "layanan"]);
    expect(tagihan?.lines.find((baris) => baris.kind === "layanan")).toMatchObject({
      label: "Layanan – Bunga Tabur (Reguler)",
      amount: HARGA_BUNGA_TABUR,
      provider: { kind: "operator" },
      targetDate: "2026-10-02",
    });

    // The job exists from the confirmation, Dijadwalkan with no payment: the Mitra Jasa is not held up by the family's.
    const order = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
    expect(order).toMatchObject({
      sumber: "saat_duka_tpu",
      makam: { almarhumName: "Siti Aminah" },
      item: [{ status: "dijadwalkan", targetDate: "2026-10-02", mitraJasa: null }],
    });
    // The family reads the same price lines on the order the confirmation shows.
    const pengurusan = await s.setup.pengurusan.orderOf(nomor, s.pemesan);
    expect(pengurusan?.harga?.map((baris) => baris.kind)).toEqual(["biaya_pengurusan", "retribusi_pemda", "layanan"]);
  });

  it("are offered only for a Layanan marked bisa hari-H, and a Saat Duka order with none is exactly as before", async () => {
    const s = await siap();
    const dasar = {
      pemesan: s.pemesan,
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      tpuId: s.tpu.id,
      almarhumName: "Siti Aminah",
      tanggalWafat: "2026-09-30",
      jenis: "baru" as const,
      kelayakan: { ktpDki: true, wafatDiJakarta: true },
      pemegangHak: { mode: "pemesan" as const },
    };

    // Pembersihan is not "bisa hari-H": it cannot be done on the burial day.
    expect(await s.setup.pengurusan.placeSaatDukaTpu({ ...dasar, layananHariH: [{ layananVariantId: s.pembersihan.id, teks: null }] })).toEqual({
      ok: false,
      reason: "layanan_tidak_tersedia",
    });
    const tanpa = await s.setup.pengurusan.placeSaatDukaTpu(dasar);
    expect(tanpa.ok).toBe(true);
  });
});

describe("the picker for a TPU job", () => {
  it("shows only Aktif Mitra Jasa covering the TPU and the Layanan and not Tidak tersedia on the target date", async () => {
    const s = await siap();
    const layak = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "layak@contoh.id", namaLengkap: "Ani Layak" });
    const tidakTersedia = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "pergi@contoh.id", namaLengkap: "Budi Pergi" });
    const ditangguhkan = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "tangguh@contoh.id", namaLengkap: "Citra Tangguh" });
    // Covers the Layanan but a different TPU: none, so no other TPU's Mitra Jasa is offered this one's job.
    const lainTpu = await mitraJasaLengkap(s.setup, s.admin, { email: "lain.tpu@contoh.id", layananVariantId: s.bunga.id, namaLengkap: "Dewi Lain" });
    // Covers the TPU but not this Layanan.
    const lainLayanan = await mitraJasaLengkap(s.setup, s.admin, { email: "lain.layanan@contoh.id", tpuDkiId: s.tpu.id, namaLengkap: "Eko Lain" });
    expect(lainTpu.id).not.toBe(lainLayanan.id);

    expect(await s.setup.layanan.tambahTidakTersedia(tidakTersedia.actor, { dari: "2026-10-04", sampai: "2026-10-06", alasan: "Pulang kampung" })).toMatchObject({ ok: true });
    expect(await s.setup.layanan.ubahStatus(s.admin, ditangguhkan.id, { status: "ditangguhkan", alasan: "Keluhan berulang" })).toMatchObject({ ok: true });
    const { job } = await pekerjaanBunga(s, "2026-10-05");

    const dibaca = await s.setup.layanan.bacaPekerjaanTpu(s.admin, job.id);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.calon.map((satu) => satu.namaLengkap)).toEqual(["Ani Layak"]);
    // On another date the one who was away is back.
    expect((await s.setup.layanan.mitraJasaTersedia(s.admin, { tpuDkiId: s.tpu.id, layananVariantId: s.bunga.id, tanggal: "2026-10-08" })).map((satu) => satu.namaLengkap)).toEqual([
      "Ani Layak",
      "Budi Pergi",
    ]);

    // A crafted request cannot assign someone the picker would not have offered.
    for (const bukanCalon of [tidakTersedia.id, ditangguhkan.id, lainTpu.id, lainLayanan.id]) {
      expect(await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: bukanCalon })).toEqual({ ok: false, reason: "mitra_jasa_tidak_tersedia" });
    }
    expect((await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: layak.id })).ok).toBe(true);
  });

  it("is Admin Platform's alone: a Mitra Jasa cannot assign, and the picker shows them nothing", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s);

    expect(await s.setup.layanan.tugaskanMitraJasa(mitra.actor, { pekerjaanId: job.id, mitraJasaId: mitra.id })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.pekerjaanTpuUntukStaf(mitra.actor)).toEqual([]);
    expect(await s.setup.layanan.bacaPekerjaanTpu(mitra.actor, job.id)).toMatchObject({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("the accept deadline", () => {
  it("is 12 h after the assignment when that is sooner than H-1 18:00", () => {
    // Assigned Thursday 09:00 for Monday: H-1 is Sunday 18:00, far later than 21:00 the same day.
    expect(batasJawabPenugasan(wib("2026-10-01 09:00"), "2026-10-05")).toEqual(wib("2026-10-01 21:00"));
  });

  it("is H-1 18:00 when that comes before 12 h have passed", () => {
    // Assigned Sunday 10:00 for Monday: 12 h would be 22:00, but H-1 18:00 (today) is sooner.
    expect(batasJawabPenugasan(wib("2026-10-04 10:00"), "2026-10-05")).toEqual(wib("2026-10-04 18:00"));
  });

  it("falls back to 12 h when H-1 18:00 has already passed at the assignment, so it is never a deadline in the past", () => {
    expect(batasJawabPenugasan(wib("2026-10-04 20:00"), "2026-10-05")).toEqual(wib("2026-10-05 08:00"));
  });

  it("is what a Mitra Jasa is given, in both branches, when Admin Platform assigns", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s, "2026-10-05");
    s.setup.clock.set(wib("2026-10-04 10:00"));
    const hasil = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    if (!hasil.ok) throw new Error(hasil.reason);
    expect(hasil.batasJawab).toEqual(wib("2026-10-04 18:00"));
  });

  it("marks an unanswered assignment Tidak direspons at the deadline, once, and the job returns to the queue", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s, "2026-10-05");
    const ditugaskan = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    if (!ditugaskan.ok) throw new Error(ditugaskan.reason);
    expect(ditugaskan.batasJawab).toEqual(wib("2026-10-01 21:00"));

    // One minute early: still theirs to answer.
    expect(await s.setup.layanan.tandaiTidakDirespons(wib("2026-10-01 20:59"))).toBe(0);
    expect((await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin))[0].penugasan).toMatchObject({ hasil: "menunggu" });

    expect(await s.setup.layanan.tandaiTidakDirespons(wib("2026-10-01 21:00"))).toBe(1);
    // Idempotent, as every tick is.
    expect(await s.setup.layanan.tandaiTidakDirespons(wib("2026-10-01 21:30"))).toBe(0);
    const [kembali] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    expect(kembali).toMatchObject({ status: "dijadwalkan", penugasan: null, alasanAntre: "tidak_direspons" });
    // An answer that comes too late is refused: the job is already back with Admin Platform.
    s.setup.clock.set(wib("2026-10-01 22:00"));
    expect(await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "terima" })).toMatchObject({ ok: false, reason: "tidak_ditemukan" });
  });
});

describe("a Mitra Jasa's answer", () => {
  it("accepting shows the Pemesan the Mitra Jasa's first name and photo, and nothing more of them", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id, { namaLengkap: "Siti Rahayu" });
    const { job, nomor } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });

    // Assigned but not answered: the family sees no one yet.
    expect((await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))?.item[0].mitraJasa).toBeNull();

    expect(await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "terima" })).toEqual({ ok: true, hasil: "diterima" });

    const dibaca = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
    expect(dibaca?.item[0].mitraJasa).toEqual({ namaDepan: "Siti", fotoUrl: expect.any(String) });
    // Never the surname, the NIK, the address or the bank account.
    expect(JSON.stringify(dibaca)).not.toMatch(/Rahayu|3201|7123456789/);
    // And a second answer to the same assignment is refused.
    expect(await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "tolak" })).toEqual({ ok: false, reason: "sudah_dijawab" });
  });

  it("declining puts the job back in the queue with the reason, and counts on the scorecard with a Tidak direspons", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    expect(await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "tolak", alasan: "Sedang sakit" })).toEqual({ ok: true, hasil: "ditolak" });

    const [kembali] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    expect(kembali).toMatchObject({
      penugasan: null,
      alasanAntre: "ditolak",
      riwayat: [{ hasil: "ditolak", alasan: "Sedang sakit" }],
    });
    // A Mitra Jasa who has declined can be offered the job again by hand, and the second assignment is one more.
    const lagi = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    expect(lagi.ok).toBe(true);
    s.setup.clock.set(wib("2026-10-02 09:00"));
    await s.setup.layanan.tandaiTidakDirespons(s.setup.clock.now());

    // Two declines, one Ditolak and one Tidak direspons, are the scorecard's one line.
    const skor = await s.setup.layanan.skorMitraJasa(s.admin, mitra.id);
    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor.declines).toBe(2);
  });

  it("only the assignment's own Mitra Jasa can answer it", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const lain = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "lain@contoh.id", namaLengkap: "Lina Lain" });
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });

    expect(await s.setup.layanan.jawabPenugasan(lain.actor, { pekerjaanId: job.id, jawaban: "terima" })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await s.setup.layanan.jawabPenugasan(s.admin, { pekerjaanId: job.id, jawaban: "terima" })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
  });

  it("is told by Peringatan Staf, by email with the deadline and no word of the family", async () => {
    const s = await siap({ notifikasiNyata: true });
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "penerima@contoh.id" });
    const { job } = await pekerjaanBunga(s);

    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });

    const surat = s.setup.email.sent.filter((pesan) => pesan.to === "penerima@contoh.id" && pesan.subject === "Pekerjaan baru ditugaskan ke Anda");
    expect(surat).toHaveLength(1);
    expect(surat[0].text).toContain("TPU Kober");
    expect(surat[0].text).toContain("Layanan – Bunga Tabur (Reguler)");
    expect(surat[0].text).not.toMatch(/Budi Santoso|Hasan Basri|081234567890|pemesan\.tpu@contoh\.id/);
  });
});

describe("every staff write on a TPU job leaves an Entri Audit", () => {
  it("records the assignment, the answer and the release on the job, by the person who did each, with no personal data in plaintext", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "rahasia.mitra@contoh.id", namaLengkap: "Siti Rahasia" });
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "terima" });
    await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId: job.id, alasan: "Ganti orang" });

    const entri = await s.setup.audit.entriesAbout({ kind: "pekerjaan_layanan_tpu", id: job.id });
    expect(entri.map((satu) => [satu.action, satu.actor.role])).toEqual([
      ["layanan.tugaskan_pekerjaan_tpu", "admin_platform"],
      ["layanan.jawab_penugasan_tpu", "mitra_jasa"],
      ["layanan.lepas_penugasan_tpu", "admin_platform"],
    ]);
    // Ids, never a name, an email or a phone number.
    const teks = JSON.stringify(entri);
    expect(teks).not.toMatch(/Rahasia|rahasia\.mitra|Budi Santoso|081234567890|Hasan Basri/);
    expect(teks).toContain(mitra.id);
  });

  it("records nothing for a write that was refused", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(mitra.actor, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId: job.id, alasan: "Tidak ada yang memegang" });

    expect(await s.setup.audit.entriesAbout({ kind: "pekerjaan_layanan_tpu", id: job.id })).toEqual([]);
  });
});

describe("what a Mitra Jasa sees of a job", () => {
  it("is the grave, the Layanan, the target date and the photos, and never a field of the family", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const jpeg = { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };
    const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-05" }]), jpeg);
    if (!dipesan.ok) throw new Error(dipesan.reason);
    await bayar(s.setup, dipesan.tagihan.id, s.setup.clock.now());
    const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });

    const saya = await s.setup.layanan.pekerjaanTpuSaya(mitra.actor);

    expect(saya.aktif).toHaveLength(1);
    expect(saya.aktif[0]).toMatchObject({
      label: "Layanan – Bunga Tabur (Reguler)",
      targetDate: "2026-10-05",
      jendela: { dari: "2026-10-03", sampai: "2026-10-07" },
      tpu: { name: "TPU Kober" },
      makam: { blokNomor: "Blok C-7 No. 21", almarhumName: "Hasan Basri", keterangan: "Dekat pohon kamboja", pin: { lat: -6.2001, lng: 106.9001 } },
      penugasan: { hasil: "menunggu", batasJawab: wib("2026-10-01 21:00") },
    });
    expect(saya.aktif[0].makam.fotoUrls).toHaveLength(1);
    // No family contact field, and no family value under any name.
    const teks = JSON.stringify(saya);
    expect(teks).not.toMatch(/Budi Santoso|081234567890|\+6281234567890|pemesan\.tpu@contoh\.id|pemesan/i);
    expect(Object.keys(saya.aktif[0]).sort()).toEqual(["id", "jendela", "label", "makam", "penugasan", "targetDate", "teks", "tpu"]);
    // Nobody else's list holds it.
    const lain = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "lain@contoh.id" });
    expect(await s.setup.layanan.pekerjaanTpuSaya(lain.actor)).toEqual({ aktif: [], riwayat: [] });
  });

  it("no longer shows the grave once the assignment has ended, whichever way", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "tolak" });

    const saya = await s.setup.layanan.pekerjaanTpuSaya(mitra.actor);
    expect(saya.aktif).toEqual([]);
    expect(saya.riwayat).toEqual([{ id: job.id, label: "Layanan – Bunga Tabur (Reguler)", targetDate: "2026-10-05", tpuName: "TPU Kober", hasil: "ditolak", dijawabAt: expect.any(Date) }]);
    expect(JSON.stringify(saya)).not.toContain("Hasan Basri");
  });
});

describe("reassignment", () => {
  it("takes a job off its Mitra Jasa with a reason, counts nothing against them, and gives it to another", async () => {
    const s = await siap();
    const pertama = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const kedua = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "kedua@contoh.id", namaLengkap: "Kiki Kedua" });
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: pertama.id });
    await s.setup.layanan.jawabPenugasan(pertama.actor, { pekerjaanId: job.id, jawaban: "terima" });

    // A reason is required, and a Mitra Jasa cannot take a job off themselves this way.
    expect(await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId: job.id, alasan: "  " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.lepasPenugasan(pertama.actor, { pekerjaanId: job.id, alasan: "Tidak mau" })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId: job.id, alasan: "Mitra Jasa sakit" })).toEqual({ ok: true });

    const [kembali] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    expect(kembali).toMatchObject({ penugasan: null, alasanAntre: "dilepas", riwayat: [{ hasil: "dilepas", alasan: "Mitra Jasa sakit" }] });
    // Releasing is neither a decline nor a completion.
    const skor = await s.setup.layanan.skorMitraJasa(s.admin, pertama.id);
    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor).toMatchObject({ declines: 0, selesai: 0 });

    const lagi = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: kedua.id });
    expect(lagi.ok).toBe(true);
    expect((await s.setup.layanan.pekerjaanTpuSaya(pertama.actor)).aktif).toEqual([]);
    expect((await s.setup.layanan.pekerjaanTpuSaya(kedua.actor)).aktif).toHaveLength(1);
  });

  it("is what a Mitra Jasa's suspension does to the Dijadwalkan jobs they hold", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job } = await pekerjaanBunga(s);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "terima" });

    const ditangguhkan = await s.setup.layanan.ubahStatus(s.admin, mitra.id, { status: "ditangguhkan", alasan: "Keluhan berulang" });
    expect(ditangguhkan).toMatchObject({ ok: true, dilepas: [{ targetDate: "2026-10-05" }], berjalan: [] });

    const [kembali] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    expect(kembali).toMatchObject({ penugasan: null, alasanAntre: "dilepas" });
    // They still log in and see their history (story 182), but not the grave.
    expect((await s.setup.layanan.pekerjaanTpuSaya(mitra.actor)).riwayat[0]).toMatchObject({ hasil: "dilepas" });
  });
});

describe("the Antrean's rows for TPU jobs", () => {
  /** The Antrean for Admin Platform on a second composition over the same database, at `at`. */
  async function antrean(s: Awaited<ReturnType<typeof siap>>, at: Date) {
    const komposisi = queuesOnTestDatabase(db);
    komposisi.clock.set(at);
    const rows = await komposisi.queues.antrean(s.admin);
    return (type: string) => rows.filter((satu) => satu.type === type);
  }

  it("Tier 1 lists a job due today with no Mitra Jasa who accepted it, and closes when one does", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { job, nomor } = await pekerjaanBunga(s, "2026-10-05");

    // A job further ahead is not urgent yet.
    expect((await antrean(s, wib("2026-10-04 09:00")))("pekerjaan_tpu_tanpa_mitra")).toEqual([]);
    const hariH = (await antrean(s, wib("2026-10-05 07:00")))("pekerjaan_tpu_tanpa_mitra");
    expect(hariH).toMatchObject([{ tier: 1, label: "Pekerjaan hari ini tanpa Mitra Jasa", subjectKind: "pekerjaan_layanan_tpu", subjectId: job.id }]);
    expect(hariH[0].subjectLabel).toContain(nomor);
    expect(hariH[0].href).toBe(`/staf/admin-platform/pekerjaan-tpu/${job.id}`);

    // Assigned but not yet accepted still counts as without a Mitra Jasa: only an acceptance closes it.
    s.setup.clock.set(wib("2026-10-05 07:00"));
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: job.id, mitraJasaId: mitra.id });
    expect((await antrean(s, wib("2026-10-05 07:30")))("pekerjaan_tpu_tanpa_mitra")).toHaveLength(1);
    await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: job.id, jawaban: "terima" });
    expect((await antrean(s, wib("2026-10-05 07:31")))("pekerjaan_tpu_tanpa_mitra")).toEqual([]);
  });

  it("Tier 2 lists Tidak direspons, Ditolak and reassignment each on its own row, and closes when the job is assigned again", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const c = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "c@contoh.id" });
    const satu = await s.setup.layanan.placePesananLayananTpu(
      s.pemesan,
      orderTpu(s, [
        { layananVariantId: s.bunga.id, targetDate: "2026-10-05" },
        { layananVariantId: s.bunga.id, targetDate: "2026-10-06" },
        { layananVariantId: s.bunga.id, targetDate: "2026-10-07" },
      ]),
    );
    if (!satu.ok) throw new Error(satu.reason);
    await bayar(s.setup, satu.tagihan.id, s.setup.clock.now());
    const [j1, j2, j3] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: j1.id, mitraJasaId: a.id });
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: j2.id, mitraJasaId: b.id });
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: j3.id, mitraJasaId: c.id });
    await s.setup.layanan.jawabPenugasan(b.actor, { pekerjaanId: j2.id, jawaban: "tolak" });
    await s.setup.layanan.jawabPenugasan(c.actor, { pekerjaanId: j3.id, jawaban: "terima" });
    await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId: j3.id, alasan: "Ganti orang" });
    await s.setup.layanan.tandaiTidakDirespons(wib("2026-10-01 21:00"));

    const baris = await antrean(s, wib("2026-10-02 09:00"));
    expect(baris("pekerjaan_tpu_tidak_direspons")).toMatchObject([{ tier: 2, subjectId: j1.id }]);
    expect(baris("pekerjaan_tpu_ditolak")).toMatchObject([{ tier: 2, subjectId: j2.id }]);
    expect(baris("pekerjaan_tpu_penugasan_ulang")).toMatchObject([{ tier: 2, subjectId: j3.id }]);

    s.setup.clock.set(wib("2026-10-02 09:00"));
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: j1.id, mitraJasaId: b.id });
    expect((await antrean(s, wib("2026-10-02 09:01")))("pekerjaan_tpu_tidak_direspons")).toEqual([]);
  });

  it("show nothing to anyone but Admin Platform", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanBunga(s, "2026-10-05");
    const komposisi = queuesOnTestDatabase(db);
    komposisi.clock.set(wib("2026-10-05 07:00"));
    expect((await komposisi.queues.antrean(mitra.actor)).map((satu) => satu.type)).not.toContain("pekerjaan_tpu_tanpa_mitra");
  });
});
