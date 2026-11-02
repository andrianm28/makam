/**
 * UAT penuh, worst cases of a Pengembalian Dana: Admin Platform pressing
 * "Terbitkan Bukti Pengembalian Dana" twice at once (two tabs, a double tap), two
 * approvals at once, and a family cancelling twice at once. Money leaves once.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { bayarTagihan, konfirmasiPesanan, pesananSaatDukaSiap } from "../../../tests/support/payouts";
import { buktiTransfer, refundsOnTestDatabase, type RefundsSetup } from "../../../tests/support/refunds";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };

function pemesanActor(pemesan: { accountId: string; email: string }): Actor {
  return { ...pemesan, phoneNumber: null, roles: ["pemesan"], lokasiIds: [], sessionId: "sesi-uji" };
}

async function pesananTerbayar(setup: RefundsSetup) {
  const fixture = await pesananSaatDukaSiap(setup);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  return { ...fixture, ...konfirmasi };
}

async function permintaanDisetujui(setup: RefundsSetup) {
  const fixture = await pesananTerbayar(setup);
  const batal = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" });
  if (!batal.ok) throw new Error(`cancellation refused: ${batal.reason}`);
  await setup.refunds.tick();
  const [permintaan] = await setup.refunds.permintaanTerbuka();
  if (!permintaan) throw new Error("no open request");
  expect(await setup.refunds.isiRekeningPemesan(pemesanActor(fixture.pemesan), { nomorPemesanan: fixture.nomor, rekening })).toMatchObject({ ok: true });
  return { ...fixture, permintaan };
}

describe("a Pengembalian Dana under concurrency (UAT penuh, worst case)", () => {
  it("two approvals at once approve it once", async () => {
    const setup = refundsOnTestDatabase(db);
    const { admin, permintaan } = await permintaanDisetujui(setup);

    const hasil = await Promise.all([
      setup.refunds.setujuiPengembalian(admin, { permintaanId: permintaan.id }),
      setup.refunds.setujuiPengembalian(admin, { permintaanId: permintaan.id }),
    ]);

    // The first approval wins; the second is either refused or answers the same approved request, never a second one.
    expect(hasil[0].ok || hasil[1].ok).toBe(true);
    for (const h of hasil) if (h.ok) expect(h.permintaan).toMatchObject({ id: permintaan.id, status: "disetujui" });
    expect(await setup.refunds.permintaan(permintaan.id)).toMatchObject({ status: "disetujui" });
    expect(await setup.refunds.pengembalianJatuhTempo()).toHaveLength(1);
  });

  it("Terbitkan Bukti Pengembalian Dana pressed twice at once issues one Bukti and refunds the family once", async () => {
    const setup = refundsOnTestDatabase(db);
    const { admin, permintaan, tagihanId } = await permintaanDisetujui(setup);
    const setuju = await setup.refunds.setujuiPengembalian(admin, { permintaanId: permintaan.id });
    if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);

    const masukan = { permintaanId: permintaan.id, ditransferPada: "2026-10-01", bukti: buktiTransfer };
    const hasil = await Promise.all([
      setup.refunds.terbitkanBuktiPengembalianDana(admin, masukan),
      setup.refunds.terbitkanBuktiPengembalianDana(admin, masukan),
    ]);

    const nomor = new Set(hasil.flatMap((h) => (h.ok ? [h.bukti.nomor] : [])));
    expect(nomor).toEqual(new Set(["RFD/2026/000001"]));
    // Reading the next number takes it (a gap in the series, harmless here): it proves no second RFD was issued.
    expect(await setup.billing.nextDocumentNumber("RFD")).toBe("RFD/2026/000002");
    expect(await setup.billing.tagihan(tagihanId)).toMatchObject({ status: "dikembalikan_penuh" });
    expect(await setup.refunds.pengembalianJatuhTempo()).toEqual([]);
  });

  it("a family cancelling twice at once opens one Pengembalian Dana request", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);

    await Promise.all([
      setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" }),
      setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" }),
    ]);
    await Promise.all([setup.refunds.tick(), setup.refunds.tick()]);

    expect(await setup.refunds.permintaanTerbuka()).toHaveLength(1);
  });
});
