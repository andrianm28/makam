/**
 * The Antrean's two Tier 3 rows of a filing-only Pengurusan IPTM (spec, Work Queues: "TPU filing-only document check
 * (1 working day) and filing (3 working days after Lunas)"; ticket 47), on the Admin Platform calendar.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addWorkingDays } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { pemesanDenganEmail, tpu } from "../../../tests/support/pengurusan";
import { queuesOnTestDatabase } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });

describe("the Antrean's Tier 3 rows of a filing-only Pengurusan IPTM", () => {
  it("shows the document check from the last upload and the filing from Lunas, each on the Admin Platform calendar", async () => {
    const setup = queuesOnTestDatabase(db);
    const admin = await siapkanOperatorPemesanan(setup as never);
    setup.clock.set(wib("2026-10-01 10:00"));
    for (const [key, amount] of [["biaya_pengurusan_berkas", 750_000], ["retribusi_pemda_iptm", 250_000]] as const) {
      await setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
    }
    const tpuDki = await tpu(setup);
    const pemesan = (await pemesanDenganEmail(setup, "pemesan@contoh.id")).pemesan;
    setup.clock.set(wib("2026-10-02 10:00"));
    const placed = await setup.pengurusan.placePengurusanIptm({
      pemesan,
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      tpuId: tpuDki.id,
      almarhumName: "Siti Aminah",
      tanggalWafat: "2026-09-25",
      jenis: "baru",
      kelayakan: { ktpDki: true, wafatDiJakarta: true },
      pemegangHak: { mode: "pemesan" },
    });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const nomor = placed.pengurusan.nomor;
    const baris = async (type: string) => (await setup.queues.antrean(admin)).filter((row) => row.type === type);
    const kalender = await setup.lokasi.adminPlatformCalendar();
    const tenggat = (dari: string, n: number) => {
      const hasil = addWorkingDays(kalender, wib(dari), n);
      if (!hasil.ok) throw new Error("calendar unavailable");
      return hasil.at;
    };
    expect(await baris("periksa_berkas_iptm")).toEqual([]);

    const order = await setup.pengurusan.orderOf(nomor, pemesan);
    for (const dokumen of order!.dokumen.pengajuan) {
      await setup.pengurusan.unggahDokumenPengajuan(pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    }
    const [periksa, ...lain] = await baris("periksa_berkas_iptm");
    expect(lain).toEqual([]);
    expect(periksa).toMatchObject({ tier: 3, subjectKind: "pengurusan_tpu", deadline: tenggat("2026-10-02 10:00", 1), href: `/staf/admin-platform/pengurusan/${nomor}` });
    expect(periksa!.subjectLabel).toContain(nomor);

    const lengkap = await setup.pengurusan.periksaDokumen(admin, { nomor });
    if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error("check refused");
    expect(await baris("periksa_berkas_iptm")).toEqual([]);
    expect(await baris("ajukan_iptm_berkas")).toEqual([]);

    setup.clock.set(wib("2026-10-02 16:00"));
    await setup.billing.recordPayment(lengkap.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await baris("ajukan_iptm_berkas")).toEqual([
      expect.objectContaining({ tier: 3, deadline: tenggat("2026-10-02 16:00", 3), href: `/staf/admin-platform/pengurusan/${nomor}` }),
    ]);

    await setup.pengurusan.ajukanIptm(admin, { nomor });
    expect(await baris("ajukan_iptm_berkas")).toEqual([]);
  });
});
