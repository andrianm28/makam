import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { identityOnTestDatabase, signedInAdminPlatform } from "../../../tests/support/identity";
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
});
