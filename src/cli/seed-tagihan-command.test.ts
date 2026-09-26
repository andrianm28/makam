import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { billingOnTestDatabase } from "../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { seedAdminCommand } from "./seed-admin-command";
import { seedTagihanCommand } from "./seed-tagihan-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });

describe("seed-tagihan (development and test stacks only)", () => {
  it("issues an example Tagihan, Belum Dibayar, and prints its page", async () => {
    await seedAdminCommand(["--email", "admin-e2e@makam.co.id", "--phone", "081100000001"], env());

    const result = await seedTagihanCommand([], env());

    expect(result.exitCode).toBe(0);
    const link = /\/dokumen\/([A-Za-z0-9_-]{43})/.exec(result.output)?.[1];
    expect(link).toBeDefined();
    // Read as at the moment it was issued (the CLI runs on the system clock).
    const { billing, clock } = billingOnTestDatabase(db);
    const issued = await billing.documentByLink(link!);
    if (issued?.type !== "tagihan") throw new Error("no Tagihan");
    clock.set(issued.tagihan.issuedAt);
    expect(await billing.documentByLink(link!)).toMatchObject({
      type: "tagihan",
      notPayableBecause: null,
      tagihan: { status: "belum_dibayar", total: 150_000 },
    });
  });

  it("issues another each time, keeping the Pengaturan Operator entered the first time", async () => {
    await seedAdminCommand(["--email", "admin-e2e@makam.co.id", "--phone", "081100000001"], env());

    await seedTagihanCommand([], env());
    const second = await seedTagihanCommand([], env());

    expect(second).toMatchObject({ exitCode: 0, output: expect.stringMatching(/TGH\/\d{4}\/000002/) });
  });

  it("needs an Admin Platform to enter the example Pengaturan Operator as", async () => {
    expect(await seedTagihanCommand([], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu.",
    });
  });

  it("refuses to run on staging or production", async () => {
    expect(await seedTagihanCommand([], env("staging"))).toEqual({
      exitCode: 1,
      output: "Ditolak: seed-tagihan hanya untuk development dan test.",
    });
    expect(await seedTagihanCommand([], env("production"))).toMatchObject({ exitCode: 1 });
  });
});
