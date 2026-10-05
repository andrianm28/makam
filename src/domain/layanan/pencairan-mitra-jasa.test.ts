import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  daftarPencairanSaya,
  diterima,
  foto,
  kirimBukti,
  mitraJasaUntuk,
  orderTpu,
  pekerjaanDisetujui,
  setujui,
  siapTpuBertarif,
  TARIF,
  type MitraJasaTpu,
  type SiapTpuBertarif,
} from "../../../tests/support/layanan-tpu";

/**
 * What a Mitra Jasa reads on their Pencairan page for TPU jobs (spec, Layanan > Mitra Jasa pay and Billing > Payouts;
 * stories 181 and 182; ticket 55 AC 3). Everything goes through the Layanan and Payouts public functions: the order, the
 * proof and its approval write the Pencairan, the Keluhan window closes it into Jatuh tempo, Admin Platform transfers it, and
 * the Mitra Jasa's list is read back.
 *
 * The fake Clock starts at Thursday 1 Oktober 2026 09:00 WIB. The Mitra Jasa rate of a Bunga Tabur is Rp 150.000.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const siap = () => siapTpuBertarif(db);
type Siap = SiapTpuBertarif;
type Mitra = MitraJasaTpu;

const BUNGA = "Layanan – Bunga Tabur (Reguler)";

/** The transfer Admin Platform's run would make to this Mitra Jasa, or null while there is none. */
async function transferUntuk(s: Siap, mitra: Mitra) {
  const rows = await s.setup.payouts.jalankanPencairan(s.admin);
  return rows.find((row) => row.recipient.kind === "mitra_jasa" && row.recipient.akunId === mitra.actor.accountId) ?? null;
}

/** Moves the clock and lets the Keluhan windows that have run out close, as the worker's tick does. */
async function jendelaTutup(s: Siap, pada: string) {
  s.setup.clock.set(wib(pada));
  await s.setup.layanan.tutupJendelaKeluhan(s.setup.clock.now());
}

describe("a Mitra Jasa's Pencairan for a TPU job", () => {
  it("shows its Layanan, TPU, date and rate from Belum jatuh tempo, through Jatuh tempo, to Dicairkan with the Bukti Pencairan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const disetujui = await pekerjaanDisetujui(s, mitra, { disetujuiPada: "2026-10-05 10:00" });

    // Belum jatuh tempo, and the date to expect is the one the job's own Keluhan window ends: 3×24 h after the approval.
    expect(await daftarPencairanSaya(s, mitra)).toMatchObject([
      {
        status: "belum_jatuh_tempo",
        tanggal: "2026-10-08",
        total: TARIF,
        bukti: null,
        pekerjaan: [{ layanan: BUNGA, tpu: s.tpu.name, tanggal: "2026-10-05", tarif: TARIF }],
      },
    ]);
    const jendela = await s.setup.layanan.jendelaKeluhanTpu(disetujui.pekerjaanId);
    if (!jendela?.berakhirAt) throw new Error("the job has no Keluhan window");
    expect((await daftarPencairanSaya(s, mitra))[0].tanggal).toBe(wibDateOf(jendela.berakhirAt));

    // The Keluhan window is 3×24 h from the approval: due once it has closed.
    await jendelaTutup(s, "2026-10-08 10:01");
    const transferSaya = await transferUntuk(s, mitra);
    if (!transferSaya) throw new Error("the run has no row for the Mitra Jasa");
    const [jatuhTempo] = await daftarPencairanSaya(s, mitra);
    expect(jatuhTempo).toMatchObject({ status: "jatuh_tempo", tanggal: wibDateOf(transferSaya.jatuhTempoAt), total: TARIF });

    s.setup.clock.set(wib("2026-10-09 10:00"));
    const terbit = await s.setup.payouts.terbitkanBuktiPencairan(s.admin, {
      itemIds: [jatuhTempo.pekerjaan[0].itemId],
      ditransferPada: "2026-10-09",
      bukti: { body: foto(), contentType: "image/jpeg" },
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    const { nomorBukti, link } = terbit.bukti;
    expect(await daftarPencairanSaya(s, mitra)).toMatchObject([
      { status: "dicairkan", tanggal: "2026-10-09", total: TARIF, bukti: { nomorBukti, link }, pekerjaan: [{ layanan: BUNGA, tpu: s.tpu.name, tarif: TARIF }] },
    ]);
    // The Bukti Pencairan the Mitra Jasa opens from that entry says the same: the same job, date and amount.
    expect(await s.setup.payouts.buktiPencairan(link)).toMatchObject({
      type: "bukti_pencairan_mitra_jasa",
      amount: TARIF,
      pekerjaan: [{ layanan: BUNGA, tanggal: "2026-10-05", tarif: TARIF }],
    });
  });

  it("adds up, for each Mitra Jasa, to the transfer Payouts will make to them, whoever else is waiting to be paid", async () => {
    const s = await siap();
    const rina = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "rina@contoh.id" });
    const budi = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "budi@contoh.id" });
    await pekerjaanDisetujui(s, rina, { targetDate: "2026-10-05", disetujuiPada: "2026-10-05 10:00" });
    await pekerjaanDisetujui(s, rina, { targetDate: "2026-10-06", disetujuiPada: "2026-10-06 10:00" });
    await pekerjaanDisetujui(s, budi, { targetDate: "2026-10-07", disetujuiPada: "2026-10-07 10:00" });
    await jendelaTutup(s, "2026-10-10 12:00");

    for (const mitra of [rina, budi]) {
      const transferSaya = await transferUntuk(s, mitra);
      if (!transferSaya) throw new Error("the run has no row for the Mitra Jasa");
      const terbuka = (await daftarPencairanSaya(s, mitra)).filter((satu) => satu.status === "jatuh_tempo");
      expect(terbuka.reduce((jumlah, satu) => jumlah + satu.total, 0)).toBe(transferSaya.neto);
      expect(terbuka.flatMap((satu) => satu.pekerjaan.map((baris) => baris.itemId)).sort()).toEqual(transferSaya.items.map((item) => item.id).sort());
    }
    expect(await daftarPencairanSaya(s, rina)).toHaveLength(2);
    expect(await daftarPencairanSaya(s, budi)).toHaveLength(1);
  });

  it("lists the newer job first", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanDisetujui(s, mitra, { targetDate: "2026-10-05", disetujuiPada: "2026-10-05 10:00" });
    await pekerjaanDisetujui(s, mitra, { targetDate: "2026-10-09", disetujuiPada: "2026-10-06 10:00" });

    expect((await daftarPencairanSaya(s, mitra)).map((satu) => satu.pekerjaan[0].tanggal)).toEqual(["2026-10-09", "2026-10-05"]);
  });

  it("is still read by a Ditangguhkan Mitra Jasa and a Berhenti one, with what was paid and what is still to be paid", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanDisetujui(s, mitra, { disetujuiPada: "2026-10-05 10:00" });

    const ditangguhkan = await s.setup.layanan.ubahStatus(s.admin, mitra.id, { status: "ditangguhkan", alasan: "Keluhan upheld dua kali" });
    expect(ditangguhkan).toMatchObject({ ok: true });
    expect(await daftarPencairanSaya(s, mitra)).toMatchObject([{ status: "belum_jatuh_tempo", total: TARIF }]);

    const berhenti = await s.setup.layanan.ubahStatus(s.admin, mitra.id, { status: "berhenti", alasan: "Berhenti bekerja" });
    expect(berhenti).toMatchObject({ ok: true });
    expect(await daftarPencairanSaya(s, mitra)).toMatchObject([{ status: "belum_jatuh_tempo", total: TARIF }]);
  });

  it("shows nothing of the family or the grave: no Nomor Pemesanan, no name, no phone number, no Blok, no Potongan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanDisetujui(s, mitra, { disetujuiPada: "2026-10-05 10:00" });
    await jendelaTutup(s, "2026-10-08 10:01");

    const tulisan = JSON.stringify(await daftarPencairanSaya(s, mitra));
    expect(tulisan).toContain(BUNGA);
    expect(tulisan).not.toMatch(/MKM-|Budi|Hasan|Siti|081234567890|pemesan\.tpu|Blok C-7|kamboja|Potongan|potongan|Hak Pakai/i);
  });

  it("shows a Pencairan cancelled because another Mitra Jasa redid the job as Dibatalkan, and pays the other Mitra Jasa the normal rate", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "a@contoh.id" });
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const asal = await pekerjaanDisetujui(s, a, { disetujuiPada: "2026-10-05 10:00" });

    const ulang = await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId: asal.pekerjaanId, mitraJasaId: b.id });
    if (!ulang.ok) throw new Error(ulang.reason);
    const jawab = await s.setup.layanan.jawabPenugasan(b.actor, { pekerjaanId: ulang.pekerjaanId, jawaban: "terima" });
    if (!jawab.ok) throw new Error(jawab.reason);
    await kirimBukti(s, b, ulang.pekerjaanId);
    await setujui(s, ulang.pekerjaanId);

    expect(await daftarPencairanSaya(s, a)).toMatchObject([{ status: "dibatalkan", total: 0, pekerjaan: [{ tarif: TARIF }] }]);
    expect(await daftarPencairanSaya(s, b)).toMatchObject([{ status: "belum_jatuh_tempo", total: TARIF }]);
  });

  it("is empty for a Mitra Jasa whose job has not been approved yet, however long the Keluhan windows tick", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-05" }]));
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    const dibayar = await s.setup.billing.recordPayment(dipesan.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: s.setup.clock.now() });
    if (!dibayar.ok) throw new Error("payment refused");
    const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    await diterima(s, mitra, job.id);
    await jendelaTutup(s, "2026-11-30 10:00");

    expect(await daftarPencairanSaya(s, mitra)).toEqual([]);
  });
});
