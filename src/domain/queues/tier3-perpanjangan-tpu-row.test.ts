/**
 * The Antrean's Tier 3 row of a Perpanjangan TPU past the masa tenggang (spec, Work Queues: "past-grace TPU check";
 * ticket 48): the Operator asks the TPU first, on the Admin Platform calendar, and the row closes with its answer.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addWorkingDays } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { makamTpuDenganIptm } from "../../../tests/support/makam-tpu";
import { queuesOnTestDatabase } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });

describe("the Antrean's Tier 3 rows of a Perpanjangan TPU", () => {
  it("shows the past-grace TPU check until the TPU has answered, and the document check only after that", async () => {
    const setup = queuesOnTestDatabase(db);
    const dasar = await makamTpuDenganIptm(setup as never, "2027-02-15");
    setup.clock.set(wib("2027-05-20 10:00"));
    const placed = await setup.pengurusan.placePerpanjanganTpu({
      pemesan: dasar.pemesan,
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      makamTpuId: dasar.makamTpuId,
      berlakuSampai: "2027-02-15",
    });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const nomor = placed.pengurusan.nomor;
    const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
    for (const dokumen of order!.dokumen.pengajuan) {
      await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    }
    const baris = async (type: string) => (await setup.queues.antrean(dasar.admin)).filter((row) => row.type === type);
    const tenggat = addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2027-05-20 10:00"), 1);
    if (!tenggat.ok) throw new Error("calendar unavailable");

    expect(await baris("cek_tpu_lewat_masa_tenggang")).toEqual([
      expect.objectContaining({ tier: 3, subjectKind: "pengurusan_tpu", deadline: tenggat.at, href: `/staf/admin-platform/pengurusan/${nomor}` }),
    ]);
    expect(await baris("periksa_berkas_iptm")).toEqual([]);

    await setup.pengurusan.putuskanCekTpu(dasar.admin, { nomor, putusan: "lanjut" });
    expect(await baris("cek_tpu_lewat_masa_tenggang")).toEqual([]);
    expect(await baris("periksa_berkas_iptm")).toEqual([expect.objectContaining({ tier: 3, href: `/staf/admin-platform/pengurusan/${nomor}` })]);
  });
});
