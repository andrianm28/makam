/**
 * The Saat Duka TPU submission (spec, Pengurusan; stories 68–72; ticket 44's
 * AC), read only through the Pengurusan module's public functions.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { Pemesan } from "@/domain/pengurusan";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  fotoIptm,
  kuburanTumpang,
  orderSaatDukaTpu,
  pengurusanOnTestDatabase,
  type PengurusanSetup,
  saatDukaTpuFixture,
  setMenerimaMakamBaru,
} from "../../../tests/support/pengurusan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/**
 * The documents each set must carry, written out here from their sources rather
 * than read back from the module, so a name the source does not carry fails the
 * test:
 * - the two sets: `.scratch/makam-v1/issues/15-saat-duka-tpu-pengurusan.md`
 *   item 7, lines 40-43 (the decision taken with the user on 2026-09-25);
 * - the Pasal 17(2) letters: research `04-cemetery-plot-regulation.md` §2.7 and
 *   `dki-tpu-burial-sequence.md` §6 (Perda DKI Jakarta 3/2007);
 * - a Tumpang's own additions: the same file, lines 41 and 27.
 */
const DOKUMEN_PEMAKAMAN_BARU = [
  "Surat keterangan kematian dari RS / Puskesmas",
  "KTP almarhum",
  "Kartu Keluarga almarhum",
];
const DOKUMEN_PENGAJUAN_BARU = [
  "Surat laporan kematian dari kelurahan",
  "Surat Kuasa",
  "KTP Pemegang Hak",
  "Kartu Keluarga Pemegang Hak",
];
const PASAL_17_DUA = [
  "Surat keterangan pemeriksaan jenazah dari RS / Puskesmas tempat asal",
  "Surat keterangan laporan kematian dari Lurah atau Kepala Desa tempat asal",
  "Surat pengantar kematian dari Dinas Kesehatan daerah asal",
];
const DOKUMEN_PEMAKAMAN_TUMPANG = [
  "IPTM lama makam yang ditumpang",
  "Surat persetujuan Pemegang Hak makam yang ditumpang",
];

/** The order the placement made, read back through the module's own read. */
function pengurusanOrder(
  setup: PengurusanSetup,
  fixture: { pemesan: Pemesan },
  nomor: string,
) {
  return setup.pengurusan.orderOf(nomor, fixture.pemesan);
}

describe("the Saat Duka TPU submission", () => {
  it("creates a Diajukan order with a Nomor Pemesanan, the deadline on the TPU clock, both document sets and no Tagihan", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 23:00"));

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture),
    );

    expect(placed).toEqual({
      ok: true,
      pengurusan: {
        nomor: "MKM-2026-000001",
        status: "diajukan",
        konfirmasiDueAt: wib("2026-10-02 08:00"),
      },
    });

    const order = await setup.pengurusan.orderOf(
      "MKM-2026-000001",
      fixture.pemesan,
    );
    expect(order).toMatchObject({
      nomor: "MKM-2026-000001",
      kind: "saat_duka_tpu",
      status: "diajukan",
      tpu: {
        id: fixture.tpuDki.id,
        name: "TPU Kober",
        address: "Jl. TPU Kober No. 1, Jakarta Timur",
      },
      pemesan: {
        name: "Budi Santoso",
        email: "pemesan@contoh.id",
        phoneNumber: "+6281234567890",
      },
      almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
      jenisPenguburan: "baru",
      // Nothing is billed at submission: the Tagihan is issued at the confirmation.
      tagihanId: null,
      konfirmasiDueAt: wib("2026-10-02 08:00"),
      diajukanAt: wib("2026-10-01 23:00"),
    });
    // Two sets, kept apart, each named exactly as its source names it
    // (`.scratch/makam-v1/issues/15-saat-duka-tpu-pengurusan.md:41-42`).
    expect(order?.dokumen.pemakaman.map((satu) => satu.nama)).toEqual(
      DOKUMEN_PEMAKAMAN_BARU,
    );
    expect(order?.dokumen.pengajuan.map((satu) => satu.nama)).toEqual(
      DOKUMEN_PENGAJUAN_BARU,
    );
  });

  it("refuses a family with neither a DKI KTP nor a death in Jakarta, and writes no order", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, {
        kelayakan: { ktpDki: false, wafatDiJakarta: false },
      }),
    );

    expect(placed).toEqual({ ok: false, reason: "kelayakan_tidak_terpenuhi" });
    expect(
      await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan),
    ).toBeNull();
  });

  it("adds exactly the three Pasal 17(2) letters to a death outside Jakarta, and nothing at all to a KTP that is not a DKI one", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    const { pengurusan } = setup;

    const luarJakarta = await pengurusan.daftarDokumen({
      jenis: "baru",
      kelayakan: { ktpDki: true, wafatDiJakarta: false },
    });
    const ktpLuar = await pengurusan.daftarDokumen({
      jenis: "baru",
      kelayakan: { ktpDki: false, wafatDiJakarta: true },
    });

    // Loss of Jakarta adds three letters, each with the Pasal 17(2) source in its note
    // (research §6: the origin region's examination letter, its Lurah's death report and
    // its Dinas Kesehatan's surat pengantar).
    expect(luarJakarta.pengajuan.map((satu) => satu.nama)).toEqual([
      ...DOKUMEN_PENGAJUAN_BARU,
      ...PASAL_17_DUA,
    ]);
    for (const satu of luarJakarta.pengajuan.slice(
      DOKUMEN_PENGAJUAN_BARU.length,
    )) {
      expect(satu.catatan).toContain("Pasal 17(2)");
    }
    // A KTP that is not a DKI one blocks the order instead of adding a document, so it never reaches a list.
    expect(ktpLuar.pengajuan.map((satu) => satu.nama)).toEqual(
      DOKUMEN_PENGAJUAN_BARU,
    );
    expect(
      ktpLuar.pengajuan.some((satu) => satu.catatan?.includes("Pasal 17")),
    ).toBe(false);
    // The burial itself is met with what it was already met with.
    expect(luarJakarta.pemakaman).toEqual(ktpLuar.pemakaman);

    // And the order carries the set its own answers produced.
    const placed = await pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, {
        kelayakan: { ktpDki: true, wafatDiJakarta: false },
      }),
    );
    expect(placed.ok).toBe(true);
    const order = await pengurusanOrder(setup, fixture, "MKM-2026-000001");
    expect(order?.dokumen.pengajuan).toEqual(luarJakarta.pengajuan);
  });

  it("makes a Tumpang only with the grave described and its IPTM photographed", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    const { pengurusan } = setup;

    expect(
      await pengurusan.placeSaatDukaTpu(
        orderSaatDukaTpu(fixture, { jenis: "tumpang" }),
      ),
    ).toEqual({
      ok: false,
      reason: "kuburan_kosong",
    });
    expect(
      await pengurusan.placeSaatDukaTpu(
        orderSaatDukaTpu(fixture, {
          jenis: "tumpang",
          kuburan: kuburanTumpang(),
        }),
      ),
    ).toEqual({ ok: false, reason: "foto_iptm_kosong" });

    const placed = await pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, {
        jenis: "tumpang",
        kuburan: kuburanTumpang(),
        fotoIptm: fotoIptm(),
      }),
    );

    expect(placed.ok).toBe(true);
    const order = await pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      jenisPenguburan: "tumpang",
      kuburan: { blokNomor: "Blok B-12 No. 34", nama: "Hasan Basri" },
    });
    // A Tumpang brings the old IPTM and, for a grave that is not the family's own, its holder's consent
    // (`.scratch/makam-v1/issues/15-saat-duka-tpu-pengurusan.md:41` and item 1).
    expect(order?.dokumen.pemakaman.map((satu) => satu.nama)).toEqual([
      ...DOKUMEN_PEMAKAMAN_BARU,
      ...DOKUMEN_PEMAKAMAN_TUMPANG,
    ]);
    expect(order?.dokumen.pengajuan.map((satu) => satu.nama)).toEqual([
      ...DOKUMEN_PENGAJUAN_BARU,
      "Scan IPTM lama makam yang ditumpang",
    ]);
  });

  it("refuses a TPU that has stopped taking new plots, though the list offered it", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    await setMenerimaMakamBaru(setup, fixture.tpuDki.id, false);

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture),
    );

    expect(placed).toEqual({
      ok: false,
      reason: "tpu_tidak_menerima_makam_baru",
    });
  });

  it("keeps a Pemegang Hak named for the IPTM, with their own contact, and never the Almarhum", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, {
        pemegangHak: {
          mode: "lain",
          name: "Andi Santoso",
          phoneNumber: "081298765432",
          email: "Andi@Keluarga.id",
        },
      }),
    );

    expect(placed.ok).toBe(true);
    const order = await setup.pengurusan.orderOf(
      "MKM-2026-000001",
      fixture.pemesan,
    );
    expect(order?.pemegangHak).toEqual({
      mode: "lain",
      name: "Andi Santoso",
      phoneNumber: "+6281298765432",
      email: "andi@keluarga.id",
    });
    expect(
      await setup.pengurusan.placeSaatDukaTpu(
        orderSaatDukaTpu(fixture, {
          pemegangHak: {
            mode: "lain",
            name: "Siti Aminah",
            phoneNumber: "081298765432",
            email: "",
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "pemegang_hak_almarhum" });
  });
});
