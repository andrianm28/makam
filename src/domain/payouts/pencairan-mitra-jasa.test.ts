/**
 * A Mitra Jasa's Pencairan as a list (spec, Billing > Payouts: "the Mitra Jasa version shows only job, Layanan, date
 * and rate"; stories 181 and 182; ticket 55 AC 3): newest first, each with its status, the date it was or is to be
 * paid, the jobs it covers (Layanan, TPU, date, rate) and what it comes to. A Mitra Jasa is paid in full, so there is
 * never a Potongan, and the list is theirs alone: no other Mitra Jasa, no order, no family, no Lokasi Mitra.
 *
 * Everything goes through the Payouts public functions: the Layanan module's `catatItemLayananMitraJasa` writes the
 * Pencairan, Admin Platform's run, hold and Bukti Pencairan settle it, and the Mitra Jasa's list is read back.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { buktiTransfer, mitraJasa, payoutsOnTestDatabase } from "../../../tests/support/payouts";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const BUNGA = { layanan: "Layanan – Bunga Tabur (Reguler)", tpu: "TPU Kober", tanggal: "2026-10-03", tarif: 150_000 };
const PEMBERSIHAN = { layanan: "Layanan – Pembersihan Makam (Reguler)", tpu: "TPU Cilincing", tanggal: "2026-10-04", tarif: 400_003 };

/** Admin Platform with Pengaturan Operator entered (a Bukti Pencairan needs the header), and two Mitra Jasa signed in. */
async function siap() {
  const setup = payoutsOnTestDatabase(db);
  const admin = await siapkanOperatorPemesanan(setup);
  setup.clock.set(wib("2026-10-01 09:00"));
  const rina = (await mitraJasa(setup, admin, "rina@contoh.id")).actor;
  const budi = (await mitraJasa(setup, admin, "budi@contoh.id")).actor;
  return { setup, admin, rina, budi };
}
type Siap = Awaited<ReturnType<typeof siap>>;

/** A job approved by Admin Platform, recorded the way the Layanan module records it (with an order number the Mitra Jasa must never see). */
async function catat(s: Siap, akun: Actor, pekerjaan: { layanan: string; tpu: string; tanggal: string; tarif: number }) {
  return s.setup.db.transaction(async (tx) => {
    const dibuat = await s.setup.payouts.catatItemLayananMitraJasa(tx, {
      akunId: akun.accountId,
      nama: "Rina Partial",
      lokasiId: null,
      pekerjaan: `${pekerjaan.layanan} – ${pekerjaan.tpu}`,
      layanan: pekerjaan.layanan,
      tpu: pekerjaan.tpu,
      tanggal: pekerjaan.tanggal,
      tarif: pekerjaan.tarif,
      nomorPemesanan: "MKM-2026-000123",
    });
    if (!dibuat.ok) throw new Error(`item refused: ${dibuat.reason}`);
    return dibuat.id;
  });
}

/** The Keluhan window of the job closed: its Pencairan is due. */
async function jatuhTempo(s: Siap, itemId: string) {
  await s.setup.db.transaction((tx) => s.setup.payouts.jadikanJatuhTempo(tx, itemId));
}

/** What the signed-in Mitra Jasa reads on their Pencairan page. */
async function daftar(s: Siap, actor: Actor) {
  const hasil = await s.setup.payouts.daftarPencairanMitraJasa(actor);
  if (!hasil.ok) throw new Error(hasil.reason);
  return hasil.pencairan;
}

/** The transfer Admin Platform's run would make to this Mitra Jasa. */
async function transferUntuk(s: Siap, actor: Actor) {
  const baris = (await s.setup.payouts.jalankanPencairan(s.admin)).find(
    (row) => row.recipient.kind === "mitra_jasa" && row.recipient.akunId === actor.accountId,
  );
  return baris ?? null;
}

async function transfer(s: Siap, itemIds: string[], pada = "2026-10-06") {
  const terbit = await s.setup.payouts.terbitkanBuktiPencairan(s.admin, { itemIds, ditransferPada: pada, bukti: buktiTransfer });
  if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
  return terbit.bukti;
}

describe("a Mitra Jasa's Pencairan, as they read it", () => {
  it("lists each Pencairan newest first with the Layanan, TPU, date and rate of its job and what it comes to", async () => {
    const s = await siap();
    const lama = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-02 09:00"));
    const baru = await catat(s, s.rina, PEMBERSIHAN);

    expect(await daftar(s, s.rina)).toMatchObject([
      {
        status: "belum_jatuh_tempo",
        tanggal: null,
        total: 400_003,
        bukti: null,
        pekerjaan: [{ itemId: baru, layanan: PEMBERSIHAN.layanan, tpu: "TPU Cilincing", tanggal: "2026-10-04", tarif: 400_003 }],
      },
      {
        status: "belum_jatuh_tempo",
        tanggal: null,
        total: 150_000,
        bukti: null,
        pekerjaan: [{ itemId: lama, layanan: BUNGA.layanan, tpu: "TPU Kober", tanggal: "2026-10-03", tarif: 150_000 }],
      },
    ]);
  });

  it("carries only the status, the date, the jobs, the total and the Bukti Pencairan: no Potongan, no order, no family", async () => {
    const s = await siap();
    await catat(s, s.rina, BUNGA);

    const [satu] = await daftar(s, s.rina);
    expect(Object.keys(satu).sort()).toEqual(["bukti", "kunci", "pekerjaan", "status", "tanggal", "total"]);
    expect(Object.keys(satu.pekerjaan[0]).sort()).toEqual(["itemId", "layanan", "tanggal", "tarif", "tpu"]);
    expect(JSON.stringify(satu)).not.toMatch(/MKM-|potongan/i);
  });

  it("is Belum jatuh tempo until the Keluhan window has closed, then Jatuh tempo with the date it is to be paid by", async () => {
    const s = await siap();
    const item = await catat(s, s.rina, BUNGA);
    expect(await daftar(s, s.rina)).toMatchObject([{ status: "belum_jatuh_tempo", tanggal: null }]);

    s.setup.clock.set(wib("2026-10-05 10:00"));
    await jatuhTempo(s, item);

    const transferSaya = await transferUntuk(s, s.rina);
    if (!transferSaya) throw new Error("the run has no row for the Mitra Jasa");
    expect(await daftar(s, s.rina)).toMatchObject([{ status: "jatuh_tempo", tanggal: wibDateOf(transferSaya.jatuhTempoAt), total: 150_000, bukti: null }]);
  });

  it("adds up to what Payouts will transfer, and a Bukti Pencairan settles those jobs as one transfer for that amount", async () => {
    const s = await siap();
    const a = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-02 09:00"));
    const b = await catat(s, s.rina, PEMBERSIHAN);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await jatuhTempo(s, a);
    await jatuhTempo(s, b);

    const transferSaya = await transferUntuk(s, s.rina);
    if (!transferSaya) throw new Error("the run has no row for the Mitra Jasa");
    const terbuka = (await daftar(s, s.rina)).filter((satu) => satu.status === "jatuh_tempo");
    expect(terbuka).toHaveLength(2);
    expect(terbuka.reduce((jumlah, satu) => jumlah + satu.total, 0)).toBe(transferSaya.neto);

    s.setup.clock.set(wib("2026-10-06 10:00"));
    const bukti = await transfer(s, [a, b]);
    const sesudah = await daftar(s, s.rina);
    expect(sesudah).toHaveLength(1);
    expect(sesudah[0]).toMatchObject({
      status: "dicairkan",
      tanggal: "2026-10-06",
      total: bukti.amount,
      bukti: { nomorBukti: bukti.nomorBukti, link: bukti.link },
    });
    expect(sesudah[0].total).toBe(550_003);
    expect(sesudah[0].pekerjaan.map((satu) => [satu.layanan, satu.tpu, satu.tanggal, satu.tarif])).toEqual(
      expect.arrayContaining([
        [BUNGA.layanan, "TPU Kober", "2026-10-03", 150_000],
        [PEMBERSIHAN.layanan, "TPU Cilincing", "2026-10-04", 400_003],
      ]),
    );
    expect(await transferUntuk(s, s.rina)).toBeNull();
  });

  it("leaves the jobs a transfer did not cover as they were, and lists the newer record first", async () => {
    const s = await siap();
    const a = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-02 09:00"));
    const b = await catat(s, s.rina, PEMBERSIHAN);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await jatuhTempo(s, a);
    await jatuhTempo(s, b);
    s.setup.clock.set(wib("2026-10-06 10:00"));
    await transfer(s, [a]);

    expect(await daftar(s, s.rina)).toMatchObject([
      { status: "dicairkan", pekerjaan: [{ itemId: a, tarif: 150_000 }] },
      { status: "jatuh_tempo", pekerjaan: [{ itemId: b, tarif: 400_003 }] },
    ]);
  });

  it("shows only their own Pencairan: another Mitra Jasa's never appears, and neither Admin Platform nor a Petugas Lapangan may ask", async () => {
    const s = await siap();
    const milikRina = await catat(s, s.rina, BUNGA);
    const milikBudi = await catat(s, s.budi, PEMBERSIHAN);

    expect((await daftar(s, s.rina)).flatMap((satu) => satu.pekerjaan.map((baris) => baris.itemId))).toEqual([milikRina]);
    expect((await daftar(s, s.budi)).flatMap((satu) => satu.pekerjaan.map((baris) => baris.itemId))).toEqual([milikBudi]);
    expect(await s.setup.payouts.daftarPencairanMitraJasa(s.admin)).toEqual({ ok: false, reason: "tidak_berwenang" });
    const petugas = await signedInPetugasLapangan(s.setup, s.admin, "petugas@contoh.id");
    expect(await s.setup.payouts.daftarPencairanMitraJasa(petugas)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("shows a Pencairan Admin Platform holds as Ditahan, without the reason, and keeps it out of the transfer", async () => {
    const s = await siap();
    const item = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await jatuhTempo(s, item);

    const ditahan = await s.setup.payouts.tahanPencairan(s.admin, { itemId: item, alasan: "Foto buktinya diperiksa ulang" });
    expect(ditahan).toMatchObject({ ok: true });
    const sambil = await daftar(s, s.rina);
    expect(sambil).toMatchObject([{ status: "ditahan", tanggal: null, total: 150_000 }]);
    expect(JSON.stringify(sambil)).not.toContain("diperiksa");
    expect(await transferUntuk(s, s.rina)).toBeNull();

    await s.setup.payouts.tahanPencairan(s.admin, { itemId: item, alasan: null });
    expect(await daftar(s, s.rina)).toMatchObject([{ status: "jatuh_tempo", total: 150_000 }]);
  });

  it("shows a Pencairan cancelled because another Mitra Jasa redid the job as Dibatalkan, paying nothing and giving no reason", async () => {
    const s = await siap();
    const item = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await s.setup.db.transaction((tx) => s.setup.payouts.batalkanItem(tx, { itemId: item, alasan: "diganti_pelaksana" }));

    const hasil = await daftar(s, s.rina);
    expect(hasil).toMatchObject([{ status: "dibatalkan", tanggal: "2026-10-05", total: 0, pekerjaan: [{ itemId: item, tarif: 150_000 }] }]);
    expect(JSON.stringify(hasil)).not.toContain("diganti");
  });

  it("shows what Payouts will pay when Admin Platform lowered the rate after a Keluhan, to the rupiah", async () => {
    const s = await siap();
    const item = await catat(s, s.rina, BUNGA);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await jatuhTempo(s, item);
    const turun = await s.setup.payouts.turunkanJumlahPencairan(s.admin, { itemId: item, amount: 75_001, catatan: "Setengah tarif setelah Keluhan" });
    expect(turun).toMatchObject({ ok: true });

    const transferSaya = await transferUntuk(s, s.rina);
    expect(await daftar(s, s.rina)).toMatchObject([{ status: "jatuh_tempo", total: 75_001, pekerjaan: [{ tarif: 75_001 }] }]);
    expect(transferSaya?.neto).toBe(75_001);
  });

  it("is empty for a Mitra Jasa with nothing to be paid yet", async () => {
    const s = await siap();
    await catat(s, s.budi, BUNGA);

    expect(await daftar(s, s.rina)).toEqual([]);
  });
});

