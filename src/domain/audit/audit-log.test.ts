import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { createAuditLog } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Audit Log", () => {
  it("an Entri Audit records the actor, role, Clock time, entity, before/after and reason", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const audit = createAuditLog({ db, clock });

    await audit.record(db, {
      actor: { accountId: "akun-admin", role: "admin_platform" },
      action: "akun.pindah_nomor",
      entity: { kind: "akun", id: "akun-pemesan" },
      before: { phoneNumber: "+6281111111111" },
      after: { phoneNumber: "+6282222222222" },
      reason: "HP hilang, KTP cocok",
    });

    expect(await audit.entriesAbout({ kind: "akun", id: "akun-pemesan" })).toEqual([
      {
        id: expect.any(String),
        at: wib("2026-10-01 09:00"),
        actor: { accountId: "akun-admin", role: "admin_platform" },
        action: "akun.pindah_nomor",
        entity: { kind: "akun", id: "akun-pemesan" },
        before: { phoneNumber: "+6281111111111" },
        after: { phoneNumber: "+6282222222222" },
        reason: "HP hilang, KTP cocok",
      },
    ]);
  });

  it("an Entri Audit written in a transaction that rolls back is not kept", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });

    await expect(
      db.transaction(async (tx) => {
        await audit.record(tx, {
          actor: { accountId: "akun-admin", role: "admin_platform" },
          action: "staf.undang",
          entity: { kind: "undangan_staf", id: "u-1" },
          before: null,
          after: { role: "admin_lokasi" },
          reason: null,
        });
        throw new Error("the write itself failed");
      }),
    ).rejects.toThrow("the write itself failed");

    expect(await audit.entriesAbout({ kind: "undangan_staf", id: "u-1" })).toEqual([]);
  });
});
