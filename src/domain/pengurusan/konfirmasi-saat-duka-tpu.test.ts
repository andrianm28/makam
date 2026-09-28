/**
 * Confirming a Saat Duka TPU order (spec, Pengurusan; stories 73 and 145; ticket
 * 45), read only through the Pengurusan module's public functions and the state
 * other modules show from outside: the Antrean row, the Petugas Lapanga's own
 * "Tugas saya", the Tagihan Billing issued, and the family message the fake
 * EmailSender recorded.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { KONFIRMASI_TPU_SAAT_DUKA_TYPE } from "@/domain/queues";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { orderSaatDukaTpu, saatDukaTpuFixture, type PengurusanSetup } from "../../../tests/support/pengurusan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The confirm form as Admin Platform fills it in: a burial inside the TPU window, a TPU contact and a Petugas. */
function konfirmasi(
  setup: PengurusanSetup,
  options: { petugasAccountId: string; pemakamanAt?: string; nomor?: string },
) {
  return {
    nomor: options.nomor ?? "MKM-2026-000001",
    pemakamanAt: options.pemakamanAt ?? "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: options.petugasAccountId,
    catatan: "Bawa peti ukuran sedang.",
  };
}

describe("the Saat Duka TPU confirmation", () => {
  it("confirms the order with the agreed burial, a pay-after Tagihan due 3×24 h after it, and the Ambil surat pengantar Tugas", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    const hasil = await setup.pengurusan.konfirmasiSaatDukaTpu(
      admin,
      konfirmasi(setup, { petugasAccountId: petugas.accountId }),
    );

    expect(hasil).toMatchObject({
      ok: true,
      pengurusan: { nomor: "MKM-2026-000001", status: "dikonfirmasi" },
      tagihan: { total: 1_750_000, dueAt: wib("2026-10-05 09:00") },
    });
    if (!hasil.ok) throw new Error("unreachable");

    // The family's own read says what the confirmation promised (story 73).
    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      status: "dikonfirmasi",
      pemakamanAt: wib("2026-10-02 09:00"),
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      adminPlatform: { name: admin.email },
      catatanKonfirmasi: "Bawa peti ukuran sedang.",
      // The two price lines the order was quoted, and no Biaya Layanan Platform.
      harga: [
        { kind: "biaya_pengurusan", label: "Biaya Pengurusan", amount: 1_750_000 },
        { kind: "retribusi_pemda", label: "Retribusi Pemda (IPTM)", amount: 0 },
      ],
    });
    expect(order?.tagihan).toMatchObject({ nomor: hasil.tagihan.nomorTagihan, total: 1_750_000, dueAt: wib("2026-10-05 09:00") });

    // Billing issued it as pay-after: a family's payment never holds up a
    // burial that has already happened, and the Operator chases it later.
    const tagihan = await setup.billing.tagihan(order!.tagihan!.id);
    expect(tagihan).toMatchObject({ kind: "pay_after", total: 1_750_000 });

    // The Petugas who fetches the letter from the TPU has it on their own list,
    // planned for the burial day, and it is a "Ambil surat pengantar".
    const tugas = (await setup.fieldwork.tugasSaya(petugas)).filter((satu) => satu.type === "ambil_surat_pengantar");
    expect(tugas).toHaveLength(1);
    expect(tugas[0]).toMatchObject({ subject: expect.stringContaining("MKM-2026-000001"), plannedDate: "2026-10-02" });
  });

  it("sends the family one message naming the burial, both contacts, the documents and the Tagihan", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pesan@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    await setup.pengurusan.konfirmasiSaatDukaTpu(
      admin,
      konfirmasi(setup, { petugasAccountId: petugas.accountId }),
    );

    expect(setup.pengurusanDikonfirmasi).toHaveLength(1);
    expect(setup.pengurusanDikonfirmasi[0]).toMatchObject({
      nomor: "MKM-2026-000001",
      email: "pemesan@contoh.id",
      pemakamanAt: wib("2026-10-02 09:00"),
      adminPlatform: { name: admin.email },
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      harga: [
        { label: "Biaya Pengurusan", amount: 1_750_000 },
        { label: "Retribusi Pemda (IPTM)", amount: 0 },
      ],
    });
    // Both document sets travel with it: the burial set and the filing set.
    expect(setup.pengurusanDikonfirmasi[0].dokumen.pemakaman.map((satu) => satu.nama)).toContain("KTP almarhum");
    expect(setup.pengurusanDikonfirmasi[0].dokumen.pengajuan.map((satu) => satu.nama)).toContain(
      "Surat laporan kematian dari kelurahan",
    );
  });

  it("is refused while the order is not waiting for it, and leaves no Tagihan behind", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.ulang@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    const sah = konfirmasi(setup, { petugasAccountId: petugas.accountId });

    expect((await setup.pengurusan.konfirmasiSaatDukaTpu(admin, sah)).ok).toBe(true);
    // Run twice: the second finds the order confirmed and writes nothing, so the
    // family is not charged twice and the Petugas has one task, not two.
    expect(await setup.pengurusan.konfirmasiSaatDukaTpu(admin, sah)).toEqual({
      ok: false,
      reason: "pengurusan_sudah_dikonfirmasi",
    });
    expect((await setup.fieldwork.tugasSaya(petugas)).filter((satu) => satu.type === "ambil_surat_pengantar")).toHaveLength(1);
  });

  it("refuses a burial outside the TPU window or in the past, and an Akun that is not a Petugas Lapangan", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.jendela@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    // 20:00 WIB is outside the fixed TPU window (06:00–18:00), so it is a typo
    // rather than an agreement with the TPU.
    expect(
      await setup.pengurusan.konfirmasiSaatDukaTpu(
        admin,
        konfirmasi(setup, { petugasAccountId: petugas.accountId, pemakamanAt: "2026-10-02 20:00" }),
      ),
    ).toEqual({ ok: false, reason: "waktu_pemakaman_tidak_terbuka" });
    // A burial in the past is refused the same way.
    expect(
      await setup.pengurusan.konfirmasiSaatDukaTpu(
        admin,
        konfirmasi(setup, { petugasAccountId: petugas.accountId, pemakamanAt: "2026-09-30 09:00" }),
      ),
    ).toEqual({ ok: false, reason: "waktu_pemakaman_tidak_terbuka" });
    // The order is untouched: still waiting, still no Tagihan.
    expect((await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan))?.tagihan).toBeNull();
    // An Admin Platform is not a Petugas Lapangan, so nobody would fetch the letter.
    expect(await setup.pengurusan.konfirmasiSaatDukaTpu(admin, konfirmasi(setup, { petugasAccountId: admin.accountId }))).toEqual(
      { ok: false, reason: "bukan_petugas_lapangan" },
    );
  });

  it("refuses a TPU that has stopped taking new plots since the family applied", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.tanda@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    await setup.lokasi.updateTpuDkiFlag(admin, fixture.tpuDki.id, { menerimaMakamBaru: false });

    expect(
      await setup.pengurusan.konfirmasiSaatDukaTpu(admin, konfirmasi(setup, { petugasAccountId: petugas.accountId })),
    ).toEqual({ ok: false, reason: "tpu_tidak_menerima_makam_baru" });
  });
});

describe("the Tier 1 Konfirmasi TPU Saat Duka row", () => {
  it("is open while the order waits for a burial to be arranged, and closes on the confirmation", async () => {
    const setup = queuesOnTestDatabase(db);
    // A Tagihan carries the Operator's header, so Pengaturan Operator is filled
    // first, exactly as the Saat Duka confirmation at a Lokasi Mitra does.
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.antrean@contoh.id");
    // A submission at 23:00 is promised a confirmation by 08:00 the next morning.
    setup.clock.set(wib("2026-10-01 23:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 23:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === KONFIRMASI_TPU_SAAT_DUKA_TYPE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tier: 1,
      subjectKind: "pengurusan_tpu",
      subjectLabel: "MKM-2026-000001 · Siti Aminah · TPU Kober",
      href: "/staf/admin-platform/pengurusan/MKM-2026-000001",
      // The two service hours the TPU window promised at submission, not the
      // moment the row was read.
      deadline: wib("2026-10-02 08:00"),
      alerts: true,
    });

    await setup.pengurusan.konfirmasiSaatDukaTpu(
      admin,
      konfirmasi(setup, { petugasAccountId: petugas.accountId, pemakamanAt: "2026-10-02 09:00" }),
    );

    // The row closes itself: the state it read has moved on.
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === KONFIRMASI_TPU_SAAT_DUKA_TYPE)).toEqual([]);
  });

  it("shows the family's own order page who took the row, once an Admin Platform Ambil's it", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    if (!placed.ok) throw new Error("unreachable");
    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    if (!order) throw new Error("unreachable");

    // Nobody has taken it yet, so the family is told nothing.
    expect(await setup.queues.ambilPengurus({ type: KONFIRMASI_TPU_SAAT_DUKA_TYPE, subjectId: order.id })).toBeNull();

    const row = (await setup.queues.antrean(admin)).find((satu) => satu.type === KONFIRMASI_TPU_SAAT_DUKA_TYPE);
    if (!row) throw new Error("no row");
    const klaim = await setup.queues.ambilRow(admin, { type: row.type, subjectId: row.subjectId });
    expect(klaim.ok).toBe(true);

    // The claim is a name and a contact the family may ring (story 73). The
    // seeded Admin Platform's own name is empty, so the Akun's email is what a
    // family is given; what matters is that a claim resolves to somebody.
    const pengurus = await setup.queues.ambilPengurus({ type: KONFIRMASI_TPU_SAAT_DUKA_TYPE, subjectId: order.id });
    // A staff Akun that has set no name is given to the family by its email,
    // never as a blank: somebody has to be there to ring.
    expect(pengurus).toMatchObject({ name: admin.email, phoneNumber: admin.phoneNumber });
    expect(pengurus?.claimedAt).toBeInstanceOf(Date);
  });
});
