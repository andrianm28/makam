import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a new Lokasi Mitra", () => {
  it("starts Belum Tayang with the typed pengelola, address and city, and no pin, agreement or bank account yet", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const created = await newLokasiMitra(setup, admin);

    const read = await setup.lokasi.lokasiMitra(admin, created.id);
    expect(read).toMatchObject({
      ok: true,
      lokasiMitra: {
        id: created.id,
        name: "Makam Wakaf Al-Ikhlas",
        pengelolaName: "Yayasan Al-Ikhlas",
        address: "Jl. Raya Pondok Rangon No. 1",
        city: "Kota Jakarta Timur",
        status: "belum_tayang",
        pin: null,
        agreement: { signedOn: null, scanUploaded: false },
        bankAccount: null,
      },
    });
  });
});

describe("the document checklist of a Lokasi Mitra", () => {
  it("defaults to the death certificate, the death report letter and the KTP + KK of the Almarhum and of the Pemesan", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const created = await newLokasiMitra(setup, admin);

    expect(created.documentChecklist).toEqual([
      "Surat keterangan kematian dari RS / Puskesmas",
      "Surat pengantar / laporan kematian dari Lurah atau RT/RW",
      "KTP dan KK Almarhum",
      "KTP dan KK Pemesan",
    ]);
  });

  it("is editable per Lokasi Mitra: another Lokasi keeps the default, and the change is audited", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const edited = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const other = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");

    const saved = await setup.lokasi.setDocumentChecklist(admin, edited.id, {
      documentChecklist: ["  Surat keterangan kematian dari RS / Puskesmas ", "", "Surat izin keluarga"],
    });

    expect(saved).toEqual({ ok: true });
    expect(await setup.lokasi.lokasiMitra(admin, edited.id)).toMatchObject({
      lokasiMitra: { documentChecklist: ["Surat keterangan kematian dari RS / Puskesmas", "Surat izin keluarga"] },
    });
    expect(await setup.lokasi.lokasiMitra(admin, other.id)).toMatchObject({
      lokasiMitra: { documentChecklist: other.documentChecklist },
    });
    expect((await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: edited.id })).at(-1)).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      action: "lokasi.ubah_dokumen",
      before: { documentChecklist: other.documentChecklist },
      after: { documentChecklist: ["Surat keterangan kematian dari RS / Puskesmas", "Surat izin keluarga"] },
    });
  });
});

describe("the bank account of a Lokasi Mitra", () => {
  it("is set and changed by Admin Platform, each change audited with the account before and after and the reason", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    const first = { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Yayasan Al-Ikhlas" };
    const second = { bankName: "BCA", accountNumber: "0987654321", accountHolder: "Yayasan Al-Ikhlas" };

    expect(await setup.lokasi.changeBankAccount(admin, created.id, { ...first, reason: "Data perjanjian" })).toEqual({ ok: true });
    setup.clock.advance({ days: 1 });
    expect(await setup.lokasi.changeBankAccount(admin, created.id, { ...second, reason: "Surat pengelola 2 Okt" })).toEqual({ ok: true });

    expect(await setup.lokasi.lokasiMitra(admin, created.id)).toMatchObject({ lokasiMitra: { bankAccount: second } });
    const entries = (await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: created.id })).filter(
      (entry) => entry.action === "lokasi.ubah_rekening",
    );
    expect(entries).toEqual([
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        before: { bankAccount: null },
        after: { bankAccount: first },
        reason: "Data perjanjian",
      }),
      expect.objectContaining({
        at: wib("2026-10-02 09:00"),
        before: { bankAccount: first },
        after: { bankAccount: second },
        reason: "Surat pengelola 2 Okt",
      }),
    ]);
  });

  it("needs a bank, an account number of digits only and the account holder's name", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);

    for (const account of [
      { bankName: "", accountNumber: "7123456789", accountHolder: "Yayasan" },
      { bankName: "BSI", accountNumber: "71-2345", accountHolder: "Yayasan" },
      { bankName: "BSI", accountNumber: "7123456789", accountHolder: " " },
    ]) {
      expect(await setup.lokasi.changeBankAccount(admin, created.id, { ...account, reason: null })).toEqual({
        ok: false,
        reason: "rekening_tidak_valid",
      });
    }
    expect(await setup.lokasi.lokasiMitra(admin, created.id)).toMatchObject({ lokasiMitra: { bankAccount: null } });
  });
});

describe("the policies and flags of a Lokasi Mitra", () => {
  it("start with the defaults: Masa Tenggang 3 months, K = 1, Terencana hold 24 h, Saat Duka window 3×24 h, Masa Pembatalan 7 days, later refund 0%", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const created = await newLokasiMitra(setup, admin);

    expect(created.policies).toEqual({
      masaTenggangMonths: 3,
      maxPerpanjanganTerms: 1,
      terencanaHoldHours: 24,
      saatDukaPaymentWindowHours: 72,
      masaPembatalanDays: 7,
      refundAfterMasaPembatalanPercent: 0,
      // Collected offline by the Lokasi Mitra; 0 until Admin Platform enters it.
      gantiPemegangHakFee: 0,
    });
  });

  it("start with Pemesanan Terencana off, tumpang off, no tumpang on released plots, and sale transfers forbidden", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const created = await newLokasiMitra(setup, admin);

    expect(created.flags).toEqual({
      pemesananTerencanaAktif: false,
      tumpang: { allowed: false, minYears: 3, maxLayers: 2 },
      tumpangOnReleasedPlots: false,
      saleTransfersAllowed: false,
    });
  });

  it("are set per Lokasi Mitra by Admin Platform and audited; inheritance transfers need no flag", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    const policies = { ...created.policies, masaTenggangMonths: 6, maxPerpanjanganTerms: 3, gantiPemegangHakFee: 250_000 };
    const flags = {
      pemesananTerencanaAktif: false,
      tumpang: { allowed: true, minYears: 5, maxLayers: 3 },
      tumpangOnReleasedPlots: true,
      saleTransfersAllowed: true,
    };

    expect(await setup.lokasi.setPoliciesAndFlags(admin, created.id, { policies, flags })).toEqual({ ok: true });

    expect(await setup.lokasi.lokasiMitra(admin, created.id)).toMatchObject({ lokasiMitra: { policies, flags } });
    expect((await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: created.id })).at(-1)).toMatchObject({
      action: "lokasi.ubah_kebijakan",
      before: { policies: created.policies, flags: created.flags },
      after: { policies, flags },
    });
  });

  it("refuse values outside the rules: a negative period, K below 1, a refund above 100%, tumpang under 2 layers", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    const { policies, flags } = created;

    for (const change of [
      { policies: { ...policies, masaTenggangMonths: -1 }, flags },
      { policies: { ...policies, maxPerpanjanganTerms: 0 }, flags },
      { policies: { ...policies, refundAfterMasaPembatalanPercent: 101 }, flags },
      { policies: { ...policies, terencanaHoldHours: 1.5 }, flags },
      { policies, flags: { ...flags, tumpang: { allowed: true, minYears: 3, maxLayers: 1 } } },
    ]) {
      expect(await setup.lokasi.setPoliciesAndFlags(admin, created.id, change)).toEqual({
        ok: false,
        reason: "kebijakan_tidak_valid",
      });
    }
    expect(await setup.lokasi.lokasiMitra(admin, created.id)).toMatchObject({ lokasiMitra: { policies, flags } });
  });
});
