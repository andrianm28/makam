import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, identityOnTestDatabase, logInByOtp, signedInAdminPlatform } from "../../../tests/support/identity";
import { authorize, pengaturanOperatorResource, type Actor, type Role } from "@/domain/identity";
import { createOperatorSettings } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Pengaturan Operator as Admin Platform would type it before launch (ticket 06). */
const pengaturan = {
  legalName: "PT Jaya Korpora Prima",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "(021) 555-0101",
  email: "halo@makam.co.id",
  csWhatsApp: "0811-2222-3333",
  csReplyHours: "dibalas mulai pukul 06:00",
};

function operatorSettingsOnTestDatabase() {
  const setup = identityOnTestDatabase(db);
  const operatorSettings = createOperatorSettings({ db, clock: setup.clock, audit: setup.audit });
  return { ...setup, operatorSettings };
}

describe("Pengaturan Operator", () => {
  it("is empty until an Admin Platform enters it: nothing is seeded", async () => {
    const { operatorSettings } = operatorSettingsOnTestDatabase();

    expect(await operatorSettings.current()).toBeNull();
    expect(await operatorSettings.inForceAt(wib("2026-10-01 09:00"))).toBeNull();
  });

  it("Admin Platform enters it; it is in force from that moment, with the CS WhatsApp number in +62 form", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-02 10:00"));

    const changed = await setup.operatorSettings.change(actor, { ...pengaturan, reason: null });

    const expected = {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "+6281122223333",
      csReplyHours: "dibalas mulai pukul 06:00",
      inForceFrom: wib("2026-10-02 10:00"),
    };
    expect(changed).toEqual({ ok: true, settings: expected });
    expect(await setup.operatorSettings.current()).toEqual(expected);
  });

  it("the values in force at an instant are the last change made at or before it, so an issued Tagihan keeps its header", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-02 10:00"));
    await setup.operatorSettings.change(actor, { ...pengaturan, reason: null });
    setup.clock.set(wib("2026-11-15 08:30"));
    await setup.operatorSettings.change(actor, {
      ...pengaturan,
      address: "Jl. Kantor Baru No. 9, Jakarta Pusat 10110",
      reason: "Kantor pindah",
    });

    expect(await setup.operatorSettings.inForceAt(wib("2026-10-02 09:59"))).toBeNull();
    expect(await setup.operatorSettings.inForceAt(wib("2026-10-02 10:00"))).toMatchObject({
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      inForceFrom: wib("2026-10-02 10:00"),
    });
    expect(await setup.operatorSettings.inForceAt(wib("2026-11-15 08:29"))).toMatchObject({
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
    });
    expect(await setup.operatorSettings.inForceAt(wib("2026-11-15 08:30"))).toMatchObject({
      address: "Jl. Kantor Baru No. 9, Jakarta Pusat 10110",
      inForceFrom: wib("2026-11-15 08:30"),
    });
    expect(await setup.operatorSettings.current()).toMatchObject({ address: "Jl. Kantor Baru No. 9, Jakarta Pusat 10110" });
  });

  it("past values cannot be rewritten: the database refuses to change or delete a kept change", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);
    await setup.operatorSettings.change(actor, { ...pengaturan, reason: null });

    await expect(db.execute(sql`update operator_settings_version set address = 'diubah'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from operator_settings_version`)).rejects.toThrow();
    expect(await setup.operatorSettings.current()).toMatchObject({ address: pengaturan.address });
  });

  it("of two changes at the same Clock instant, the later one is in force", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);
    await setup.operatorSettings.change(actor, { ...pengaturan, csReplyHours: "dibalas mulai pukul 06:00", reason: null });
    await setup.operatorSettings.change(actor, { ...pengaturan, csReplyHours: "dibalas mulai pukul 07:00", reason: null });

    expect(await setup.operatorSettings.inForceAt(setup.clock.now())).toMatchObject({
      csReplyHours: "dibalas mulai pukul 07:00",
    });
  });

  it("each change records an Entri Audit with the values before and after, and the reason", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-02 10:00"));
    await setup.operatorSettings.change(actor, { ...pengaturan, reason: null });
    setup.clock.set(wib("2026-10-03 11:00"));
    await setup.operatorSettings.change(actor, { ...pengaturan, csWhatsApp: "+62 812 0000 1111", reason: "Nomor CS baru" });

    const firstValues = {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "+6281122223333",
      csReplyHours: "dibalas mulai pukul 06:00",
    };
    expect(await setup.audit.entriesAbout({ kind: "pengaturan_operator", id: "operator" })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-02 10:00"),
        actor: { accountId: actor.accountId, role: "admin_platform" },
        action: "pengaturan_operator.ubah",
        before: null,
        after: firstValues,
        reason: null,
      }),
      expect.objectContaining({
        at: wib("2026-10-03 11:00"),
        actor: { accountId: actor.accountId, role: "admin_platform" },
        action: "pengaturan_operator.ubah",
        before: firstValues,
        after: { ...firstValues, csWhatsApp: "+6281200001111" },
        reason: "Nomor CS baru",
      }),
    ]);
  });

  it("the CS WhatsApp number is refused like an Akun number: malformed, or not an Indonesian number", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);

    expect(await setup.operatorSettings.change(actor, { ...pengaturan, csWhatsApp: "0811", reason: null })).toEqual({
      ok: false,
      reason: "nomor_tidak_valid",
    });
    expect(
      await setup.operatorSettings.change(actor, { ...pengaturan, csWhatsApp: "+6591234567", reason: null }),
    ).toEqual({ ok: false, reason: "nomor_bukan_indonesia" });
    expect(await setup.operatorSettings.current()).toBeNull();
  });

  it("the Operator's email must be an email; it is kept trimmed and lower-cased", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);

    expect(await setup.operatorSettings.change(actor, { ...pengaturan, email: "halo@", reason: null })).toEqual({
      ok: false,
      reason: "email_tidak_valid",
    });
    expect(await setup.operatorSettings.current()).toBeNull();

    await setup.operatorSettings.change(actor, { ...pengaturan, email: "  Halo@Makam.co.id ", reason: null });
    expect(await setup.operatorSettings.current()).toMatchObject({ email: "halo@makam.co.id" });
  });

  it("every value is required; surrounding spaces are dropped", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { actor } = await signedInAdminPlatform(setup);

    for (const field of ["legalName", "address", "phone", "csReplyHours"] as const) {
      expect(await setup.operatorSettings.change(actor, { ...pengaturan, [field]: "   ", reason: null })).toEqual({
        ok: false,
        reason: "isian_wajib",
        field,
      });
    }
    expect(await setup.operatorSettings.current()).toBeNull();

    await setup.operatorSettings.change(actor, { ...pengaturan, legalName: "  PT Jaya Korpora Prima  ", reason: "  " });
    expect(await setup.operatorSettings.current()).toMatchObject({ legalName: "PT Jaya Korpora Prima" });
    expect(await setup.audit.entriesAbout({ kind: "pengaturan_operator", id: "operator" })).toMatchObject([
      { reason: null },
    ]);
  });

  it("only Admin Platform may change it: a Pemesan is refused and nothing is kept or audited", async () => {
    const setup = operatorSettingsOnTestDatabase();
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, "085555555555");
    const pemesan = await actorOf(setup.identity, cookies);

    expect(await setup.operatorSettings.change(pemesan, { ...pengaturan, reason: null })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.operatorSettings.current()).toBeNull();
    expect(await setup.audit.entriesAbout({ kind: "pengaturan_operator", id: "operator" })).toEqual([]);
  });

  it("an Admin Platform who has not passed TOTP in this session is refused", async () => {
    const setup = operatorSettingsOnTestDatabase();
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, "081111111111");
    const adminBeforeTotp = await actorOf(setup.identity, cookies);

    expect(await setup.operatorSettings.change(adminBeforeTotp, { ...pengaturan, reason: null })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await setup.operatorSettings.current()).toBeNull();
  });
});

describe("who may open the Pengaturan Operator screen", () => {
  const actor = (roles: Role[], totp: Actor["totp"]): Actor => ({
    accountId: "akun-staf",
    phoneNumber: "+6281111111111",
    roles: ["pemesan", ...roles],
    totp,
    sessionId: "sesi-staf",
  });

  it("only an Admin Platform past TOTP; no other role, not even one holding several", () => {
    const open = (who: Actor) => authorize(who, "pengaturan_operator.lihat", pengaturanOperatorResource());

    expect(open(actor(["admin_platform"], "lolos"))).toEqual({ allowed: true });
    expect(open(actor(["admin_platform"], "perlu_verifikasi"))).toEqual({ allowed: false, reason: "perlu_totp" });
    expect(open(actor(["admin_lokasi", "petugas_lapangan", "mitra_jasa"], "tidak_perlu"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(open(actor([], "tidak_perlu"))).toEqual({ allowed: false, reason: "tidak_berwenang" });
  });
});
