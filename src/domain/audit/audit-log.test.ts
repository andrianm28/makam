import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { createAuditLog, type NewAuditEntry } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pindahNomor = (phoneNumber: string): NewAuditEntry => ({
  actor: { accountId: "akun-admin", role: "admin_platform" },
  action: "akun.pindah_nomor",
  entity: { kind: "akun", id: "akun-pemesan" },
  before: null,
  after: { phoneNumber },
  reason: "uji",
});

describe("Audit Log", () => {
  it("an Entri Audit records the actor, role, Clock time, entity, before/after and reason", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const audit = createAuditLog({ db, clock });

    await audit.staffWrite(db, async (_tx, record) => {
      await record({
        actor: { accountId: "akun-admin", role: "admin_platform" },
        action: "akun.pindah_nomor",
        entity: { kind: "akun", id: "akun-pemesan" },
        before: { phoneNumber: "+6281111111111" },
        after: { phoneNumber: "+6282222222222" },
        reason: "HP hilang, KTP cocok",
      });
      return { ok: true };
    });

    expect(await audit.entriesAbout({ kind: "akun", id: "akun-pemesan" })).toEqual([
      {
        id: expect.any(String),
        at: wib("2026-10-01 09:00"),
        actor: { accountId: "akun-admin", role: "admin_platform" },
        action: "akun.pindah_nomor",
        entity: { kind: "akun", id: "akun-pemesan" },
        // Not about a Lokasi Mitra.
        lokasiId: null,
        before: { phoneNumber: "+6281111111111" },
        after: { phoneNumber: "+6282222222222" },
        reason: "HP hilang, KTP cocok",
      },
    ]);
  });

  it("entries written at the same Clock time come back in the order they were written", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });
    const numbers = Array.from({ length: 20 }, (_, index) => `+62811${index.toString().padStart(8, "0")}`);

    for (const phoneNumber of numbers) {
      await audit.staffWrite(db, async (_tx, record) => {
        await record(pindahNomor(phoneNumber));
        return { ok: true };
      });
    }

    const entries = await audit.entriesAbout({ kind: "akun", id: "akun-pemesan" });
    expect(entries.map((entry) => entry.after?.phoneNumber)).toEqual(numbers);
  });

  it("an Entri Audit of a staff write that fails is not kept", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });

    await expect(
      audit.staffWrite(db, async (_tx, record) => {
        await record(pindahNomor("+6282222222222"));
        throw new Error("the write itself failed");
      }),
    ).rejects.toThrow("the write itself failed");

    expect(await audit.allEntries()).toEqual([]);
  });

  it("a staff write that is refused keeps nothing, not even the Entri Audit it started", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });

    const refused = await audit.staffWrite(db, async (_tx, record) => {
      await record(pindahNomor("+6282222222222"));
      return { ok: false, reason: "nomor_sudah_dipakai" } as const;
    });

    expect(refused).toEqual({ ok: false, reason: "nomor_sudah_dipakai" });
    expect(await audit.allEntries()).toEqual([]);
  });

  it("a staff write that records no Entri Audit is refused: it cannot commit", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });

    await expect(audit.staffWrite(db, async () => ({ ok: true }))).rejects.toThrow(
      "A staff write must record an Entri Audit",
    );
  });

  it("the Audit Log is append-only: the database refuses to change or delete an Entri Audit", async () => {
    const audit = createAuditLog({ db, clock: new FakeClock(wib("2026-10-01 09:00")) });
    await audit.staffWrite(db, async (_tx, record) => {
      await record(pindahNomor("+6282222222222"));
      return { ok: true };
    });

    await expect(db.execute(sql`update audit_entry set reason = 'diubah'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_entry`)).rejects.toThrow();
    expect(await audit.allEntries()).toMatchObject([{ reason: "uji" }]);
  });
});

describe("the Audit Log of one Lokasi Mitra (the Admin Lokasi view)", () => {
  const LOKASI = "5d1f4c2e-0000-4000-8000-000000000001";
  const OTHER = "5d1f4c2e-0000-4000-8000-000000000002";
  const entry = (action: NewAuditEntry["action"], lokasiId: string | null, reason: string): NewAuditEntry => ({
    actor: { accountId: "akun-admin", role: "admin_platform" },
    action,
    entity: { kind: "lokasi_mitra", id: lokasiId ?? "tanpa-lokasi" },
    lokasiId,
    before: null,
    after: { reason },
    reason,
  });

  it("holds only the entries about that Lokasi, oldest first, and hides Catatan Internal and Antrean claims", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const audit = createAuditLog({ db, clock });
    for (const next of [
      entry("lokasi.buat", LOKASI, "dibuat"),
      entry("lokasi.buat", OTHER, "Lokasi lain"),
      entry("catatan_internal.tulis", LOKASI, "catatan internal"),
      entry("lokasi.ubah_rekening", LOKASI, "rekening"),
      entry("antrean.ambil", LOKASI, "klaim Antrean"),
      entry("akun.pindah_nomor", null, "bukan tentang Lokasi"),
    ]) {
      await audit.staffWrite(db, async (_tx, record) => {
        await record(next);
        return { ok: true };
      });
      clock.advance({ minutes: 1 });
    }

    const entries = await audit.entriesForLokasi(LOKASI);

    expect(entries.map((found) => [found.action, found.reason])).toEqual([
      ["lokasi.buat", "dibuat"],
      ["lokasi.ubah_rekening", "rekening"],
    ]);
    expect(entries[0]).toMatchObject({ lokasiId: LOKASI, at: wib("2026-10-01 09:00") });
    expect((await audit.allEntries()).length).toBe(6);
  });

  it("unfiltered (Admin Platform's view), holds every entry about that Lokasi, Catatan Internal and Antrean claims included", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const audit = createAuditLog({ db, clock });
    for (const next of [
      entry("lokasi.buat", LOKASI, "dibuat"),
      entry("catatan_internal.tulis", LOKASI, "catatan internal"),
      entry("lokasi.buat", OTHER, "Lokasi lain"),
      entry("antrean.ambil", LOKASI, "klaim Antrean"),
    ]) {
      await audit.staffWrite(db, async (_tx, record) => {
        await record(next);
        return { ok: true };
      });
      clock.advance({ minutes: 1 });
    }

    expect((await audit.allEntriesForLokasi(LOKASI)).map((found) => [found.action, found.reason])).toEqual([
      ["lokasi.buat", "dibuat"],
      ["catatan_internal.tulis", "catatan internal"],
      ["antrean.ambil", "klaim Antrean"],
    ]);
  });
});
