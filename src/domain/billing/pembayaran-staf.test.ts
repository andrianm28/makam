import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { logIn } from "../../../tests/support/identity";
import type { IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

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

type Setup = Awaited<ReturnType<typeof billingWithOperatorSettings>>;

async function issued(setup: Setup, input: IssueTagihanInput = terencana) {
  const result = await setup.billing.issueTagihan(input);
  if (!result.ok) throw new Error(`not issued: ${result.reason}`);
  return result.tagihan;
}

const jpeg = { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };

/** An Admin Lokasi of `lokasiId`, invited directly through Identity (Billing needs no real Lokasi Mitra row to test its guard). */
async function adminLokasiActor(setup: Setup, lokasiId: string = LOKASI.lokasiId, email = "lokasi@contoh.id") {
  const invited = await setup.identity.inviteStaff(setup.adminPlatform, { email, phoneNumber: "083333333333", role: "admin_lokasi", lokasiId });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

describe("catatPembayaranManual (Admin Platform: Transfer manual / Tunai)", () => {
  it("marks the Tagihan Lunas with method Transfer manual, the proof recorded, and audits it", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const recorded = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "transfer_manual",
      reference: "TRF-1",
      bukti: jpeg,
    });

    expect(recorded).toMatchObject({
      ok: true,
      bukti: { method: { kind: "transfer_manual" }, reference: "TRF-1", tagihan: { status: "lunas" } },
    });
    if (!recorded.ok) return;
    expect(recorded.bukti.proofKey).toMatch(/^pembayaran\//);
    expect(await setup.audit.entriesAbout({ kind: "bukti_pembayaran", id: recorded.bukti.id })).toMatchObject([
      { action: "tagihan.catat_pembayaran_manual", actor: { role: "admin_platform" } },
    ]);
  });

  it("marks the Tagihan Lunas with method Tunai", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const recorded = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "tunai",
      reference: null,
      bukti: jpeg,
    });

    expect(recorded).toMatchObject({ ok: true, bukti: { method: { kind: "tunai" } } });
  });

  it("requires a proof file: an unrecognised upload is refused and nothing is settled or audited", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const recorded = await setup.billing.catatPembayaranManual(setup.adminPlatform, {
      tagihanId: tagihan.id,
      metode: "tunai",
      reference: null,
      bukti: { body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" },
    });

    expect(recorded).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("fires the downstream-effect registry exactly once", async () => {
    const methods: string[] = [];
    const setup = await billingWithOperatorSettings(db, {
      paymentEffects: [{ name: "test.observe", run: async (_tx, payment) => void methods.push(payment.method.kind) }],
    });
    const tagihan = await issued(setup);

    await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", reference: null, bukti: jpeg });

    expect(methods).toEqual(["tunai"]);
  });

  it("a pay-first Tagihan past its due date can't be paid this way either", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-03 09:30"));

    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", reference: null, bukti: jpeg }),
    ).toEqual({ ok: false, reason: "batas_pembayaran_lewat" });
  });

  it("an already Lunas Tagihan is refused, not paid twice", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", reference: null, bukti: jpeg });

    expect(
      await setup.billing.catatPembayaranManual(setup.adminPlatform, { tagihanId: tagihan.id, metode: "tunai", reference: null, bukti: jpeg }),
    ).toEqual({ ok: false, reason: "sudah_lunas" });
  });

  it("only Admin Platform may record it: an Admin Lokasi is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const lokasi = await adminLokasiActor(setup);

    expect(
      await setup.billing.catatPembayaranManual(lokasi, { tagihanId: tagihan.id, metode: "tunai", reference: null, bukti: jpeg }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("catatPembayaranLangsung (the Tagihan's own Admin Lokasi: \"Dibayar langsung ke Lokasi Mitra\")", () => {
  it("reads \"diterima oleh Lokasi Mitra X\", records the direct-payment method, and audits it against the Lokasi", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const lokasi = await adminLokasiActor(setup);

    const recorded = await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: jpeg });

    expect(recorded).toMatchObject({
      ok: true,
      bukti: { method: { kind: "langsung_ke_lokasi", lokasiName: LOKASI.name }, tagihan: { status: "lunas" } },
    });
    if (!recorded.ok) return;
    expect(await setup.audit.entriesAbout({ kind: "bukti_pembayaran", id: recorded.bukti.id })).toMatchObject([
      { action: "tagihan.catat_pembayaran_langsung", actor: { role: "admin_lokasi" }, lokasiId: LOKASI.lokasiId },
    ]);
  });

  it("requires a proof file", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const lokasi = await adminLokasiActor(setup);

    expect(
      await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: { body: new Uint8Array(0), contentType: "image/jpeg" } }),
    ).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
  });

  it("fires the downstream-effect registry exactly once", async () => {
    const methods: string[] = [];
    const setup = await billingWithOperatorSettings(db, {
      paymentEffects: [{ name: "test.observe", run: async (_tx, payment) => void methods.push(payment.method.kind) }],
    });
    const tagihan = await issued(setup);
    const lokasi = await adminLokasiActor(setup);

    await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: jpeg });

    expect(methods).toEqual(["langsung_ke_lokasi"]);
  });

  it("only the Tagihan's own Lokasi Mitra's Admin Lokasi may record it, not another Lokasi's", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const other = await adminLokasiActor(setup, "another-lokasi-000", "lain@contoh.id");

    expect(await setup.billing.catatPembayaranLangsung(other, { tagihanId: tagihan.id, bukti: jpeg })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });

  it("Admin Platform may not record a direct payment (only reverse one)", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    expect(await setup.billing.catatPembayaranLangsung(setup.adminPlatform, { tagihanId: tagihan.id, bukti: jpeg })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });

  it("refused for a Tagihan with no Lokasi Mitra line: there is no partner to have paid it directly", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup, {
      ...terencana,
      lines: [{ kind: "biaya_pengurusan", label: "Biaya Pengurusan", amount: rp(500_000), provider: { kind: "operator" } }],
    });
    const lokasi = await adminLokasiActor(setup);

    expect(await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: jpeg })).toEqual({
      ok: false,
      reason: "bukan_lokasi_mitra",
    });
  });

  it("an already Lunas Tagihan is refused, not paid twice", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const lokasi = await adminLokasiActor(setup);
    await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: jpeg });

    expect(await setup.billing.catatPembayaranLangsung(lokasi, { tagihanId: tagihan.id, bukti: jpeg })).toEqual({
      ok: false,
      reason: "sudah_lunas",
    });
  });
});
