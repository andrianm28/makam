/**
 * Offering a family another TPU, and their answer to it (spec, Pemesanan > Saat
 * Duka: "Tawarkan alternatif … accept or decline by the Pemesan; declining
 * becomes a Tolak"; the TPU form of it, ticket 45, AC 3), read only through the
 * Pengurusan module's public functions.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { KONFIRMASI_TPU_SAAT_DUKA_TYPE } from "@/domain/queues";
import { pengurusanTpu } from "./schema";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { orderSaatDukaTpu, saatDukaTpuFixture, tpu } from "../../../tests/support/pengurusan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A submitted order, with the second TPU the offer will name. */
async function denganDuaTpu(setup: ReturnType<typeof queuesOnTestDatabase>) {
  setup.clock.set(wib("2026-10-01 10:00"));
  const fixture = await saatDukaTpuFixture(setup);
  const lain = await tpu(setup, { name: "TPU Bambu Apus" });
  setup.clock.set(wib("2026-10-01 10:00"));
  const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  if (!placed.ok) throw new Error("unreachable");
  return { fixture, lain };
}

describe("offering another TPU for a Saat Duka TPU order", () => {
  it("keeps the order on the TPU the family applied to until they answer", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const { fixture, lain } = await denganDuaTpu(setup);

    const ditawarkan = await setup.pengurusan.tawarkanTpuLain(admin, {
      nomor: "MKM-2026-000001",
      tpuId: lain.id,
      alasan: "TPU Kober penuh untuk minggu itu.",
    });
    expect(ditawarkan).toEqual({ ok: true, tpu: { id: lain.id, name: "TPU Bambu Apus", address: "Jl. TPU Bambu Apus No. 1, Jakarta Timur" }, alasan: "TPU Kober penuh untuk minggu itu." });

    // The order has not moved: the family is still chasing the TPU they asked
    // for until they answer, so the Tier 1 row stays open.
    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      status: "diajukan",
      tpu: { name: "TPU Kober" },
      tawaran: { tpu: { name: "TPU Bambu Apus" }, alasan: "TPU Kober penuh untuk minggu itu." },
    });
    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === KONFIRMASI_TPU_SAAT_DUKA_TYPE);
    expect(rows).toHaveLength(1);
  });

  it("refuses a TPU that is off the list, one that has stopped taking new plots, and the one already chosen", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const { fixture, lain } = await denganDuaTpu(setup);
    await setup.lokasi.updateTpuDkiFlag(admin, lain.id, { menerimaMakamBaru: false });

    const tawaran = (tpuId: string) => ({ nomor: "MKM-2026-000001", tpuId, alasan: "Penuh." });
    expect(await setup.pengurusan.tawarkanTpuLain(admin, tawaran("tpu-tidak-ada"))).toEqual({
      ok: false,
      reason: "tpu_tidak_ada",
    });
    expect(await setup.pengurusan.tawarkanTpuLain(admin, tawaran(lain.id))).toEqual({
      ok: false,
      reason: "tpu_tidak_menerima_makam_baru",
    });
    // Offering the TPU the order already names is not an offer.
    expect(await setup.pengurusan.tawarkanTpuLain(admin, tawaran(fixture.tpuDki.id))).toEqual({
      ok: false,
      reason: "tpu_sama",
    });
  });

  it("moves the order onto the accepted TPU and starts the two-service-hour clock again", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const { fixture, lain } = await denganDuaTpu(setup);
    await setup.pengurusan.tawarkanTpuLain(admin, {
      nomor: "MKM-2026-000001",
      tpuId: lain.id,
      alasan: "TPU Kober penuh untuk minggu itu.",
    });

    // 17:00 on the TPU window: only one service hour is left before its 18:00
    // close, so the second lands at 07:00 the next morning. That is Lokasi's own
    // working-time calculator answering, not a second rule kept beside it.
    setup.clock.set(wib("2026-10-01 17:00"));
    expect(await setup.pengurusan.jawabTpuLain(fixture.pemesan, { nomor: "MKM-2026-000001", diterima: true })).toEqual({
      ok: true,
      status: "diajukan",
      tpu: { id: lain.id, name: "TPU Bambu Apus" },
    });

    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      status: "diajukan",
      tpu: { id: lain.id, name: "TPU Bambu Apus" },
      // Counted again from the moment the family accepted, on the TPU window.
      konfirmasiDueAt: wib("2026-10-02 07:00"),
      tawaran: null,
    });
    // The document set is re-derived from the family's own two answers, so a
    // screen and the order can never disagree about what to bring.
    expect(order?.dokumen.pemakaman.map((satu) => satu.nama)).toContain("KTP almarhum");
  });

  it("turns a declined offer into a Tolak, as a Lokasi alternative does", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const { fixture, lain } = await denganDuaTpu(setup);
    await setup.pengurusan.tawarkanTpuLain(admin, {
      nomor: "MKM-2026-000001",
      tpuId: lain.id,
      alasan: "TPU Kober penuh untuk minggu itu.",
    });

    expect(await setup.pengurusan.jawabTpuLain(fixture.pemesan, { nomor: "MKM-2026-000001", diterima: false })).toEqual({
      ok: true,
      status: "ditolak",
      tpu: { id: fixture.tpuDki.id, name: "TPU Kober" },
    });

    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({ status: "ditolak", alasan: "TPU lain ditolak oleh keluarga" });
    // A declined order leaves the Tier 1 row: there is nothing left to confirm.
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === KONFIRMASI_TPU_SAAT_DUKA_TYPE)).toEqual([]);
  });

  it("refuses an answer from another Akun, and an answer with nothing offered", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const { lain } = await denganDuaTpu(setup);
    await setup.pengurusan.tawarkanTpuLain(admin, {
      nomor: "MKM-2026-000001",
      tpuId: lain.id,
      alasan: "TPU Kober penuh untuk minggu itu.",
    });

    // Another family's Akun is not this order's Pemesan.
    expect(
      await setup.pengurusan.jawabTpuLain({ accountId: "akun-lain" }, { nomor: "MKM-2026-000001", diterima: true }),
    ).toEqual({ ok: false, reason: "pengurusan_tidak_ditemukan" });
  });

  it("refuses an answer when nothing has been offered", async () => {
    const setup = queuesOnTestDatabase(db);
    await siapkanOperatorPemesanan(setup);
    const { fixture } = await denganDuaTpu(setup);

    expect(await setup.pengurusan.jawabTpuLain(fixture.pemesan, { nomor: "MKM-2026-000001", diterima: true })).toEqual({
      ok: false,
      reason: "tidak_ada_tawaran",
    });
  });
});

describe("a Saat Duka TPU order that lacks the burial data it must carry", () => {
  it("is refused, not read through an assertion, when its confirmation or the family's accepted offer needs the data", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
    const { fixture, lain } = await denganDuaTpu(setup);
    await setup.pengurusan.tawarkanTpuLain(admin, { nomor: "MKM-2026-000001", tpuId: lain.id, alasan: "Penuh." });
    await db.update(pengurusanTpu).set({ jenisPenguburan: null, kelayakan: null, almarhumName: null, tanggalWafat: null });

    expect(await setup.pengurusan.jawabTpuLain(fixture.pemesan, { nomor: "MKM-2026-000001", diterima: true })).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    const konfirmasi = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
      nomor: "MKM-2026-000001",
      pemakamanAt: "2026-10-02 09:00",
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      petugasAccountId: petugas.accountId,
    });
    expect(konfirmasi).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    expect(await setup.pengurusan.konfirmasiTpuTerbuka()).toEqual([]);
  });
});
