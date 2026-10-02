/**
 * The Antrean's Tier 3 "IPTM filing" row (spec, Work Queues: "Tier 3: IPTM filing (7 days)"; ticket 46):
 * a Saat Duka TPU order whose documents are complete waits for Admin Platform to file on JakEVO.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import { queuesOnTestDatabase, type QueuesSetup } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });

/** A Saat Duka TPU order confirmed and recorded Dimakamkan on 2026-10-02 12:00, its documents not yet checked. */
async function pesananDimakamkan(setup: QueuesSetup) {
  const admin = await siapkanOperatorPemesanan(setup as never);
  const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
  const fixture = await saatDukaTpuFixture(setup);
  const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const nomor = placed.pengurusan.nomor;
  const konfirmasi = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
    nomor,
    pemakamanAt: "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: petugas.accountId,
    catatan: "",
  });
  if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
  setup.clock.set(wib("2026-10-02 12:00"));
  const dimakamkan = await setup.pengurusan.catatDimakamkan(admin, { nomor });
  if (!dimakamkan.ok) throw new Error(`Dimakamkan refused: ${dimakamkan.reason}`);
  return { admin, pemesan: fixture.pemesan, nomor };
}

async function dokumenLengkap(setup: QueuesSetup, dasar: Awaited<ReturnType<typeof pesananDimakamkan>>) {
  const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor: dasar.nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
  setup.clock.set(wib("2026-10-03 10:00"));
  const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
  if (!lengkap.ok) throw new Error(`Dokumen Lengkap refused: ${lengkap.reason}`);
}

const barisIptm = async (setup: QueuesSetup, admin: Parameters<QueuesSetup["queues"]["antrean"]>[0]) =>
  (await setup.queues.antrean(admin)).filter((row) => row.type === "iptm_diajukan");

describe("the Antrean's Tier 3 IPTM filing row", () => {
  it("opens at Dokumen Lengkap with a 7-day deadline, and closes when the IPTM is filed", async () => {
    const setup = queuesOnTestDatabase(db);
    const dasar = await pesananDimakamkan(setup);
    expect(await barisIptm(setup, dasar.admin)).toEqual([]);

    await dokumenLengkap(setup, dasar);
    const [baris, ...lain] = await barisIptm(setup, dasar.admin);
    expect(lain).toEqual([]);
    expect(baris).toMatchObject({
      tier: 3,
      label: "IPTM filing",
      subjectKind: "pengurusan_tpu",
      deadline: wib("2026-10-10 10:00"),
      alerts: false,
      pastDeadline: false,
    });
    expect(baris!.subjectLabel).toContain(dasar.nomor);
    expect(baris!.href).toBe(`/staf/admin-platform/pengurusan/${dasar.nomor}`);

    setup.clock.set(wib("2026-10-10 10:01"));
    expect((await barisIptm(setup, dasar.admin))[0]).toMatchObject({ pastDeadline: true });

    const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
    expect(diajukan.ok).toBe(true);
    expect(await barisIptm(setup, dasar.admin)).toEqual([]);
  });
});
