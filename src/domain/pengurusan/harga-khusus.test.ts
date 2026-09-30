/**
 * A Saat Duka TPU order whose Tagihan a Harga Khusus reissued under a new id (ticket 93): the family's read of its own order
 * names the Tagihan in force, with its number, total and link, never the one that was replaced.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a Saat Duka TPU order after a Harga Khusus reissued its Tagihan (ticket 93)", () => {
  it("shows the family the replacement Tagihan: its number, its reduced total and its link", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
    setup.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    const konfirmasi = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
      nomor: "MKM-2026-000001",
      pemakamanAt: "2026-10-02 09:00",
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      petugasAccountId: petugas.accountId,
      catatan: "Bawa peti ukuran sedang.",
    });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    const khusus = await setup.billing.tetapkanHargaKhusus(admin, {
      tagihanId: konfirmasi.tagihan.id,
      amount: 250_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const pengganti = khusus.tagihan;

    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);

    expect(order?.tagihan).toEqual({ id: pengganti.id, nomor: pengganti.nomorTagihan, total: 1_500_000, dueAt: pengganti.dueAt, link: pengganti.link });
    const daftar = await setup.pengurusan.pesananSaya(fixture.pemesan);
    expect(daftar[0]?.tagihan?.id).toBe(pengganti.id);
  });
});
