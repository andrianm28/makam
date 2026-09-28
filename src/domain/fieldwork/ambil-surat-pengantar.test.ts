/**
 * The Tier 2 "Ambil surat pengantar" row (spec, Work Queues: "unassigned or
 * overdue Ambil surat pengantar"; ticket 45, AC 5). The Operator fetches the
 * letter from the TPU itself on the burial day, so a task nobody collected in
 * time needs someone in the office to hand it to. The row reads the Field Work
 * module's own open tasks, so it closes when the Petugas completes one.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order, which is what creates the "Ambil surat pengantar" Tugas. */
async function konfirmasi(setup: ReturnType<typeof queuesOnTestDatabase>, burialDay: string) {
  const admin = await siapkanOperatorPemesanan(setup);
  const petugas = await signedInPetugasLapangan(setup, admin, `petugas.pengantar@contoh.id`);
  setup.clock.set(wib("2026-10-01 10:00"));
  const fixture = await saatDukaTpuFixture(setup);
  setup.clock.set(wib("2026-10-01 10:00"));
  await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  const hasil = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
    nomor: "MKM-2026-000001",
    pemakamanAt: burialDay,
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: petugas.accountId,
    catatan: "",
  });
  if (!hasil.ok) throw new Error(`konfirmasi refused: ${hasil.reason}`);
  return { admin, petugas };
}

describe("the Ambil surat pengantar Tugas and its Tier 2 row", () => {
  it("is created once on the confirmation, and the row is due at the end of the burial day", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin } = await konfirmasi(setup, "2026-10-02 09:00");

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === "ambil_surat_pengantar");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tier: 2,
      subjectKind: "fieldwork_tugas",
      // Tier 2 alerts, as Tier 1 does; only Tier 3 and 4 never do.
      alerts: true,
      href: "/staf/admin-platform/tugas-lapangan",
      deadline: wib("2026-10-02 23:59"),
    });
  });

  it("closes when the Petugas completes it with the letter's photo", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, petugas } = await konfirmasi(setup, "2026-10-02 09:00");
    const row = (await setup.queues.antrean(admin)).find((satu) => satu.type === "ambil_surat_pengantar");
    if (!row) throw new Error("no row");

    // Selesai is refused without the letter: the filing is stuck without it.
    expect(
      await setup.fieldwork.completeTugasLapangan(petugas, row.subjectId, { form: { note: "" }, uploads: [] }),
    ).toEqual({ ok: false, reason: "unggah_kurang" });

    const selesai = await setup.fieldwork.completeTugasLapangan(petugas, row.subjectId, {
      form: { note: "Surat pengantar diambil diloket 2." },
      uploads: [{ kind: "dokumen", file: { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" } }],
    });
    expect(selesai.ok).toBe(true);

    expect((await setup.queues.antrean(admin)).filter((satu) => satu.type === "ambil_surat_pengantar")).toEqual([]);
  });

  it("is created only once, however often the confirmation is run", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, petugas } = await konfirmasi(setup, "2026-10-02 09:00");

    // The second confirmation is refused because the order is no longer waiting,
    // so a family is never billed twice and the Petugas never gets two letters to
    // fetch for one burial.
    const kedua = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
      nomor: "MKM-2026-000001",
      pemakamanAt: "2026-10-02 09:00",
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      petugasAccountId: petugas.accountId,
      catatan: "",
    });
    expect(kedua).toEqual({ ok: false, reason: "pengurusan_sudah_dikonfirmasi" });
    expect((await setup.fieldwork.tugasSaya(petugas)).filter((satu) => satu.type === "ambil_surat_pengantar")).toHaveLength(1);
  });
});
