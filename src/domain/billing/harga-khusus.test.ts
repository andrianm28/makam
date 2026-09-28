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

async function adminLokasiActor(setup: Setup, lokasiId = LOKASI.lokasiId) {
  const invited = await setup.identity.inviteStaff(setup.adminPlatform, {
    email: "lokasi@contoh.id",
    phoneNumber: "083333333333",
    role: "admin_lokasi",
    lokasiId,
  });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, "lokasi@contoh.id");
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

describe("tetapkanHargaKhusus", () => {
  it("cancels and reissues the Tagihan with a new negative 'Penyesuaian Harga Khusus' line, every other line unchanged, and audits the reason", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    const result = await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
      tagihanId: original.id,
      amount: 1_000_000,
      alasan: "Keluarga kurang mampu, disetujui manajer",
    });

    expect(result).toMatchObject({
      ok: true,
      tagihan: {
        nomorTagihan: "TGH/2026/000002",
        total: 4_150_000,
        lines: [
          ...original.lines,
          { kind: "penyesuaian_harga_khusus", label: "Penyesuaian Harga Khusus", amount: -1_000_000, provider: { kind: "operator" } },
        ],
        replacesNomorTagihan: "TGH/2026/000001",
      },
      cancelled: { nomorTagihan: "TGH/2026/000001", status: "dibatalkan", cancelledReason: "diganti" },
    });
    if (!result.ok) return;
    expect(await setup.audit.entriesAbout({ kind: "tagihan", id: result.tagihan.id })).toMatchObject([
      { action: "tagihan.tetapkan_harga_khusus", actor: { role: "admin_platform" }, reason: "Keluarga kurang mampu, disetujui manajer" },
    ]);
    // Immutability: the original Tagihan's own lines never moved.
    expect(await setup.billing.tagihan(original.id)).toMatchObject({ lines: original.lines, status: "dibatalkan" });
  });

  it("a reduction equal to the whole total makes the reissued Tagihan Rp 0, Lunas at once with 'Tanpa pembayaran (Harga Khusus)'", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    const result = await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
      tagihanId: original.id,
      amount: 5_150_000,
      alasan: "Keringanan penuh",
    });

    expect(result).toMatchObject({ ok: true, tagihan: { total: 0, status: "lunas" } });
    if (!result.ok) return;
    const document = await setup.billing.documentByLink(result.tagihan.link);
    expect(document).toMatchObject({ type: "tagihan", buktiLink: expect.any(String) });
    if (document?.type !== "tagihan" || !document.buktiLink) throw new Error("no Bukti Pembayaran");
    const bukti = await setup.billing.documentByLink(document.buktiLink);
    expect(bukti).toMatchObject({ type: "bukti_pembayaran", bukti: { method: { kind: "tanpa_pembayaran" }, amount: 0 } });
  });

  it("a reason is required", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 100_000, alasan: "" }),
    ).toEqual({ ok: false, reason: "input_tidak_valid" });
  });

  it("a reduction larger than the Tagihan's total is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 6_000_000, alasan: "Terlalu besar" }),
    ).toEqual({ ok: false, reason: "harga_khusus_melebihi_total" });
  });

  it("the partner share defaults to 0 (the Operator bears the whole reduction) and needs no note", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    const result = await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
      tagihanId: original.id,
      amount: 500_000,
      alasan: "Keringanan kecil",
    });

    expect(result).toMatchObject({ ok: true, tagihan: { hargaKhususPorsiMitra: null } });
  });

  it("a non-zero partner share requires a note", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
        tagihanId: original.id,
        amount: 500_000,
        alasan: "Keringanan kecil",
        porsiMitra: 200_000,
      }),
    ).toEqual({ ok: false, reason: "input_tidak_valid" });
  });

  it("a non-zero partner share with a note is recorded on the reissued Tagihan", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    const result = await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
      tagihanId: original.id,
      amount: 500_000,
      alasan: "Keringanan kecil",
      porsiMitra: 200_000,
      catatanPorsiMitra: "Lokasi Mitra setuju menanggung sebagian",
    });

    expect(result).toMatchObject({
      ok: true,
      tagihan: { hargaKhususPorsiMitra: { amount: 200_000, catatan: "Lokasi Mitra setuju menanggung sebagian" } },
    });
  });

  it("a partner share larger than the reduction itself is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
        tagihanId: original.id,
        amount: 500_000,
        alasan: "Keringanan kecil",
        porsiMitra: 600_000,
        catatanPorsiMitra: "Terlalu banyak",
      }),
    ).toEqual({ ok: false, reason: "porsi_melebihi_pengurangan" });
  });

  it("a partner share on a Tagihan with no Lokasi Mitra line (a TPU order) is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup, {
      ...terencana,
      lines: [{ kind: "biaya_pengurusan", label: "Biaya Pengurusan", amount: rp(500_000), provider: { kind: "operator" } }],
    });

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, {
        tagihanId: original.id,
        amount: 100_000,
        alasan: "Keringanan",
        porsiMitra: 50_000,
        catatanPorsiMitra: "Catatan",
      }),
    ).toEqual({ ok: false, reason: "porsi_tidak_berlaku" });
  });

  it("an already Lunas Tagihan cannot be given a Harga Khusus: a Tagihan is reissued, never edited", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);
    const paid = await setup.billing.recordPayment(original.id, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error("not paid");

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 100_000, alasan: "Terlambat" }),
    ).toEqual({ ok: false, reason: "tagihan_tidak_bisa_diganti" });
  });

  it("a pay-first Tagihan already past its due date cannot be reissued, even before the lapse tick has run", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);
    setup.clock.set(wib("2026-10-03 09:00"));

    expect(
      await setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 100_000, alasan: "Terlambat" }),
    ).toEqual({ ok: false, reason: "tagihan_tidak_bisa_diganti" });
  });

  it("only Admin Platform may set a Harga Khusus", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);
    const lokasi = await adminLokasiActor(setup);

    expect(
      await setup.billing.tetapkanHargaKhusus(lokasi, { tagihanId: original.id, amount: 100_000, alasan: "Keringanan" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});
