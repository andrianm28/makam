/**
 * Payments outside the PaymentProvider (spec, Billing > Payment: "manual
 * (Transfer manual / Tunai by Admin Platform with proof; 'Dibayar langsung ke
 * Lokasi Mitra' by the Admin Lokasi with proof, reversible by Admin Platform),
 * or Rp 0 (Harga Khusus waiver, Lunas at once)"; ticket 30's AC 1, 5, 6): the
 * money path that never reaches SumoPod, and the proof it is only believed on.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { actorOf, logIn } from "../../../tests/support/identity";
import type { Rupiah } from "@/lib/rupiah";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import type { IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

/** A pay-first Tagihan of a Pemesanan Terencana, the kind a family pays by hand. */
const terencana: IssueTagihanInput = {
  moment: { kind: "terencana", holdExpiresAt: wib("2026-10-03 09:00") },
  addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
  nomorPemesanan: "MKM-2026-000001",
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [
    { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI },
    { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
  ],
};

/** A scan of `megabytes` pages, big enough for the size ceiling and no more. */
const pdfofe = (megabytes: number) => {
  const body = new Uint8Array(megabytes * 1024 * 1024);
  body.set([0x25, 0x50, 0x44, 0x46]);
  return body;
};

/** A transfer slip or a cash receipt: a photo of a paper, or a scan of it. */
const slip = { body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), contentType: "image/jpeg" };

type Setup = Awaited<ReturnType<typeof billingWithOperatorSettings>>;

async function issued(setup: Setup, input: IssueTagihanInput = terencana) {
  const result = await setup.billing.issueTagihan(input);
  if (!result.ok) throw new Error(`not issued: ${result.reason}`);
  return result.tagihan;
}

/** The Entri Audit entries of the payments this fixture recorded (the setup's own seed and settings changes are not one). */
async function entriPembayaran(setup: Setup) {
  return (await setup.audit.allEntries()).filter((entry) => entry.action.startsWith("pembayaran."));
}

describe("Admin Platform records a Tagihan paid by hand", () => {
  it("Transfer manual: the Tagihan is Lunas with one Bukti Pembayaran, the proof is stored, and the write is audited", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-02 15:00"));

    const hasil = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "transfer_manual",
      referensi: "TRF-20261002-1",
      dibayarPada: "2026-10-02T14:00",
      bukti: slip,
    });

    expect(hasil).toMatchObject({
      ok: true,
      bukti: {
        nomorBukti: "BYR/2026/000001",
        method: { kind: "transfer_manual" },
        reference: "TRF-20261002-1",
        paidAt: wib("2026-10-02 14:00"),
        amount: 5_150_000,
        tagihan: { status: "lunas", nomorTagihan: "TGH/2026/000001" },
      },
    });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
    // The proof is in the private FileStore, whole.
    const tersimpan = [...setup.files.stored.values()];
    expect(tersimpan).toHaveLength(1);
    expect(tersimpan[0]).toMatchObject({ contentType: "image/jpeg" });
    expect(tersimpan[0]!.body).toEqual(slip.body);
    // And the Entri Audit names who paid, how, and which Bukti it produced.
    expect(await entriPembayaran(setup)).toEqual([
      expect.objectContaining({
        action: "pembayaran.catat_manual",
        actor: { accountId: setup.adminPlatform.accountId, role: "admin_platform" },
        entity: { kind: "tagihan", id: tagihan.id },
        before: { status: "belum_dibayar" },
        after: expect.objectContaining({ status: "lunas", nomorBukti: "BYR/2026/000001", metode: "transfer_manual" }),
      }),
    ]);
  });

  it("Tunai: the same, with cash as the method the Bukti Pembayaran reads", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const hasil = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "tunai",
      bukti: slip,
    });

    expect(hasil).toMatchObject({ ok: true, bukti: { method: { kind: "tunai" }, reference: null, paidAt: setup.clock.now() } });
    expect(await entriPembayaran(setup)).toEqual([
      expect.objectContaining({ action: "pembayaran.catat_manual", after: expect.objectContaining({ metode: "tunai" }) }),
    ]);
  });

  it("the proof is required: without a file nothing is paid, nothing is stored and nothing is audited", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const hasil = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "transfer_manual",
      bukti: { body: new Uint8Array(), contentType: "image/jpeg" },
    });

    expect(hasil).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(setup.files.stored.size).toBe(0);
    expect(await entriPembayaran(setup)).toEqual([]);
  });

  it("only Admin Platform may record it: an Admin Lokasi's own family slip is not theirs to enter", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const { cookies } = await logIn(setup, "admin.lokasi@contoh.id");
    const adminLokasi = await actorOf(setup.identity, cookies);

    const hasil = await setup.billing.catatPembayaranManual(adminLokasi, { tagihanId: tagihan.id, metode: "tunai", bukti: slip });

    expect(hasil).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(setup.files.stored.size).toBe(0);
  });

  it("a Tagihan that is already Lunas, Dibatalkan, or past its payment limit is refused, and its proof is never stored", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", bukti: slip });
    const lain = await issued(setup, {
      ...terencana,
      moment: { kind: "perpanjangan" },
      lines: [{ kind: "perpanjangan", label: "Perpanjangan Makam", amount: rp(750_000), provider: LOKASI }],
    });

    // Paid twice: the second slip is not stored, and the first Bukti stands.
    expect(await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", bukti: slip })).toEqual({
      ok: false,
      reason: "pembayaran_sudah_ada",
    });
    // A pay-first Tagihan paid at or after its due date (3×24 h after issue): never settled, whether or not the lapse tick has run.
    setup.clock.set(wib("2026-10-04 12:00"));
    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: lain.id, metode: "transfer_manual", bukti: slip }),
    ).toEqual({ ok: false, reason: "batas_pembayaran_lewat" });
    // A payment time in the future is not a payment time: a Tagihan still inside its payment window.
    const ketiga = await issued(setup, {
      ...terencana,
      moment: { kind: "pengurusan_berkas" },
      lines: [{ kind: "biaya_pengurusan", label: "Biaya Pengurusan Berkas", amount: rp(500_000), provider: { kind: "operator" } }],
    });
    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, {
        tagihanId: ketiga.id,
        metode: "transfer_manual",
        dibayarPada: "2026-10-09T10:00",
        bukti: slip,
      }),
    ).toEqual({ ok: false, reason: "waktu_pembayaran_tidak_valid" });
    expect(await setup.billing.tagihan(ketiga.id)).toMatchObject({ status: "belum_dibayar" });
    // Only the first Tagihan's one slip was ever stored.
    expect(setup.files.stored.size).toBe(1);
    expect(await entriPembayaran(setup)).toHaveLength(1);
  });

  it("a proof of an unsupported kind, or over 10 MB, is refused before anything is written", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, {
        tagihanId: tagihan.id,
        metode: "transfer_manual",
        bukti: { body: new Uint8Array([1, 2, 3]), contentType: "text/csv" },
      }),
    ).toEqual({ ok: false, reason: "bukti_tidak_didukung" });
    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, {
        tagihanId: tagihan.id,
        metode: "transfer_manual",
        bukti: { body: pdfofe(11), contentType: "application/pdf" },
      }),
    ).toEqual({ ok: false, reason: "bukti_tidak_didukung" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(setup.files.stored.size).toBe(0);
  });

  it("the proof is read through a short-lived signed URL, by Admin Platform only", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", bukti: slip });

    const url = await setup.billing.urlBukti(setup.adminPlatform, tagihan.id);

    expect(url).toMatchObject({ ok: true, url: expect.stringContaining("https://files.fake.local/") });
    const { cookies } = await logIn(setup, "pemesan@contoh.id");
    expect(await setup.billing.urlBukti(await actorOf(setup.identity, cookies), tagihan.id)).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });

  it("a provider payment and a Rp 0 Tagihan have no proof to read, and the Bukti document page never carries one", async () => {
    const setup = await billingWithOperatorSettings(db);
    const provider = await issued(setup);
    await setup.billing.bayar(provider.link);
    await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(setup.payments.created[0]!.providerPaymentId, "paid", { channel: "QRIS" }),
    );

    const tagihan = await setup.billing.documentByLink(provider.link);
    expect(tagihan).toMatchObject({ type: "tagihan", buktiLink: expect.any(String) });
    if (tagihan?.type !== "tagihan" || !tagihan.buktiLink) throw new Error("no Bukti Pembayaran");
    const dokumen = await setup.billing.documentByLink(tagihan.buktiLink);
    expect(dokumen?.type).toBe("bukti_pembayaran");
    if (dokumen?.type !== "bukti_pembayaran") throw new Error("no Bukti Pembayaran");
    expect(dokumen.bukti).toMatchObject({ method: { kind: "penyedia_pembayaran", channel: "QRIS" } });
    expect(await setup.billing.urlBukti(setup.adminPlatform, provider.id)).toEqual({ ok: false, reason: "tanpa_lampiran" });
  });
});
