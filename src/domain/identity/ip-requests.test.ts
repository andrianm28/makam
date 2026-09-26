import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { identityOnTestDatabase } from "../../../tests/support/identity";
import { pruneIpRequests } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("pruning the per-IP request records (scheduler tick)", () => {
  it("deletes the records older than 24 hours and keeps the rest; running it twice is harmless", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const start = clock.now();
    await identity.requestKodeMasuk({ email: "satu@contoh.id", ip: "203.0.113.1" });
    clock.advance({ hours: 23 });
    await identity.requestKodeMasuk({ email: "dua@contoh.id", ip: "203.0.113.2" });

    const at24h = new Date(start.getTime() + 24 * 3_600_000 + 1_000);
    expect(await pruneIpRequests({ db }, at24h)).toEqual({ deleted: 1 });
    expect(await pruneIpRequests({ db }, at24h)).toEqual({ deleted: 0 });
    expect(await pruneIpRequests({ db }, new Date(start.getTime() + 47 * 3_600_000 + 1_000))).toEqual({ deleted: 1 });
  });

  it("never touches the last hour's records, so the per-IP limits still hold right after it", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    await identity.requestKodeMasuk({ email: "satu@contoh.id", ip: "203.0.113.1" });

    expect(await pruneIpRequests({ db }, clock.now())).toEqual({ deleted: 0 });
    expect(await identity.requestKodeMasuk({ email: "dua@contoh.id", ip: "203.0.113.1" })).toMatchObject({
      ok: false,
      reason: "tunggu_kirim_ulang",
    });
  });
});
