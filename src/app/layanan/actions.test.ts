/**
 * The Layanan order's Kirim at a Lokasi Mitra, for the payload the family-side form builds (spec, Layanan > Order;
 * stories 84 and 86; ticket 115). The form is filled the way a Pemesan fills it, `itemPesananLayanan` turns what
 * they typed into the `item` the form sends (the same function the form calls), and the real Server Action
 * (authenticate, check the role, validate with Zod, call the Layanan module) answers. The question here is whether
 * what the Pemesan chose and typed is what reaches the order; what a Tagihan is made of is the Layanan module's
 * own tests (`src/domain/layanan/pesanan.test.ts`).
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB: a Batu Nisan with a 3-day lead time may be asked for
 * from 4 Oktober, a Tabur Bunga with a 1-day lead time from 2 Oktober.
 *
 * The last block is the other end of the same form (ticket 118): the choice after a Layanan is put back to "Tidak
 * dipesan", read by the running price (`hargaPilihanLayanan`) and by Kirim, through the same functions the form calls.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { testServerRuntime } from "../../../tests/support/server-runtime";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, siapkanOperatorLayanan } from "../../../tests/support/layanan";
import { tawarkanLayananDi } from "../../../tests/support/pemesanan";
import { hargaPilihanLayanan, kirimPesananLayanan } from "./actions";
import { itemPesananLayanan, pilihVarian, varianDipilih, type IsianLayanan } from "./item-pesanan";
import { tampilanPesananLayanan } from "./tampilan";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../tests/support/next-request"));

const { db, close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/**
 * A Lokasi Mitra that offers a Batu Nisan (which asks for the Tulisan pada nisan) and a Tabur Bunga (which asks for
 * nothing), a Petak Makam held by somebody else, and a Pemesan signed in. `tampilan` is what the order page hands the form.
 */
async function siap() {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { jenis: "nisan", nama: "Batu Nisan", teksLabel: "Tulisan pada nisan", leadTimeDays: 3, amount: 900_000 });
  const bunga = await tawarkanLayananDi(setup, lokasi.lokasiMitra.id, { nama: "Tabur Bunga", leadTimeDays: 1, amount: 150_000 });
  const petak = await petakDenganHakPakai(setup, lokasi);
  const login = await server.logIn("pemesan.layanan@contoh.id");
  browser.store(login.session.cookies);
  const pemesan = { accountId: login.account.id, email: login.account.email };
  const tampilan = await tampilanPesananLayanan({ lokasi: lokasi.lokasiMitra.id, petak: petak.petakId }, null);
  return { lokasi, petak, nisan: { layananId: lokasi.layanan.id, varianId: lokasi.varian.id }, bunga: { layananId: bunga.layanan.id, varianId: bunga.varian.id }, pemesan, tampilan };
}

type Siap = Awaited<ReturnType<typeof siap>>;

/**
 * What the form holds after a Pemesan has filled it in: one variant, date and text per Layanan the Pemesan
 * touched, each stored under that **Layanan's** id, as the form's own fields do. A date or a text the Pemesan
 * never touched is simply not there.
 */
function isian(isi: { layananId: string; varianId: string; tanggal?: string; teks?: string }[]): IsianLayanan {
  return {
    dipilih: Object.fromEntries(isi.map((satu) => [satu.layananId, satu.varianId])),
    tanggal: Object.fromEntries(isi.flatMap((satu) => (satu.tanggal === undefined ? [] : [[satu.layananId, satu.tanggal]]))),
    teks: Object.fromEntries(isi.flatMap((satu) => (satu.teks === undefined ? [] : [[satu.layananId, satu.teks]]))),
  };
}

/** What "Pesan layanan" sends: the Pemesan's own fields, and the items the Layanan fields add up to. */
function draftForm(s: Siap, isi: IsianLayanan) {
  return {
    lokasiId: s.lokasi.lokasiMitra.id,
    petakId: s.petak.petakId,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    item: itemPesananLayanan(s.tampilan.layanan, isi),
  };
}

/** The order as its Pemesan reads it back, by the Nomor Pemesanan the Kirim answered with. */
async function pesananDibaca(s: Siap, hasil: Awaited<ReturnType<typeof kirimPesananLayanan>>) {
  if (hasil.status !== "selesai") throw new Error(`order not placed: ${JSON.stringify(hasil)}`);
  const pesanan = await server.runtime().layanan.pesananLayananOf(hasil.nomor, s.pemesan);
  if (!pesanan) throw new Error("the order cannot be read back");
  return pesanan;
}

describe("Kirim of a Layanan order at a Lokasi Mitra, for the payload the form builds", () => {
  it("a Batu Nisan with the Tulisan pada nisan the Pemesan typed is accepted, and the Tulisan is on its order", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(draftForm(s, isian([{ ...s.nisan, teks: "  Siti Aminah binti Ahmad, wafat 2026  " }])));

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item).toHaveLength(1);
    expect(pesanan.item[0].label).toContain("Batu Nisan");
    expect(pesanan.item[0].teks).toBe("Siti Aminah binti Ahmad, wafat 2026");
    // No date was picked, so it is the earliest a 3-day lead time allows from 1 Oktober.
    expect(pesanan.item[0].targetDate).toBe("2026-10-04");
  });

  it("the target date the Pemesan picked is the target date of the order, not the earliest the lead time allows", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(draftForm(s, isian([{ ...s.bunga, tanggal: "2026-10-20" }])));

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item[0].label).toContain("Tabur Bunga");
    expect(pesanan.item[0].targetDate).toBe("2026-10-20");
  });

  it("a Layanan that asks for text is still refused, in its own words, while the Pemesan has typed nothing", async () => {
    const s = await siap();

    const refusal = { status: "gagal", message: "Layanan ini minta isian tambahan. Isi dulu kolomnya." };
    expect(await kirimPesananLayanan(draftForm(s, isian([{ ...s.nisan, tanggal: "2026-10-20" }])))).toEqual(refusal);
    // Spaces are no text either.
    expect(await kirimPesananLayanan(draftForm(s, isian([{ ...s.nisan, tanggal: "2026-10-20", teks: "   " }])))).toEqual(refusal);
  });

  it("with no target date picked, the earliest date the Layanan's lead time allows is the order's target date", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(draftForm(s, isian([s.bunga])));

    // Today is 1 Oktober and a Tabur Bunga has a 1-day lead time.
    expect((await pesananDibaca(s, hasil)).item[0].targetDate).toBe("2026-10-02");
  });

  it("a target date the Pemesan cleared again is the earliest date, which is what the field shows", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(draftForm(s, isian([{ ...s.bunga, tanggal: "" }])));

    // A Tabur Bunga has a 1-day lead time.
    expect((await pesananDibaca(s, hasil)).item[0].targetDate).toBe("2026-10-02");
  });

  it("two Layanan ordered together each keep their own target date and text", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(
      draftForm(
        s,
        isian([
          { ...s.nisan, tanggal: "2026-10-25", teks: "Siti Aminah" },
          { ...s.bunga, tanggal: "2026-10-12" },
        ]),
      ),
    );

    const pesanan = await pesananDibaca(s, hasil);
    const dari = (label: string) => pesanan.item.find((satu) => satu.label.includes(label));
    expect(dari("Batu Nisan")).toMatchObject({ targetDate: "2026-10-25", teks: "Siti Aminah" });
    // The Tabur Bunga asks for no text, so none is sent for it.
    expect(dari("Tabur Bunga")).toMatchObject({ targetDate: "2026-10-12", teks: null });
  });

  it("a Layanan the Pemesan put back to 'Tidak dipesan' is not on the order, and what was typed for it is not sent", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(
      draftForm(
        s,
        isian([
          { layananId: s.nisan.layananId, varianId: "", tanggal: "2026-10-25", teks: "Siti Aminah" },
          { ...s.bunga, tanggal: "2026-10-12" },
        ]),
      ),
    );

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item).toHaveLength(1);
    expect(pesanan.item[0].label).toContain("Tabur Bunga");
  });
});

describe("the Layanan chosen at a Lokasi Mitra after one is put back to 'Tidak dipesan'", () => {
  /** What the form holds once the Pemesan chose a Batu Nisan and a Tabur Bunga, and put the Batu Nisan back. */
  const nisanDikembalikan = (s: Siap) =>
    pilihVarian(pilihVarian(pilihVarian({}, s.nisan.layananId, s.nisan.varianId), s.bunga.layananId, s.bunga.varianId), s.nisan.layananId, "");

  it("the price breakdown is still shown, for the Layanan that remains chosen, and is the total of the order", async () => {
    const s = await siap();
    const dipilih = nisanDikembalikan(s);

    // What the form asks the running price about: the variants still chosen.
    const harga = await hargaPilihanLayanan({ lokasiId: s.lokasi.lokasiMitra.id, layananVariantIds: varianDipilih(dipilih) });

    expect(harga).not.toBeNull();
    const baris = harga!.parts.map((satu) => satu.label).join(" | ");
    expect(baris).toContain("Tabur Bunga");
    expect(baris).not.toContain("Batu Nisan");
    expect(harga!.total).toBe(150_000 + harga!.platformFee);
    // ... and that total is what the order the form sends then holds.
    const pesanan = await pesananDibaca(s, await kirimPesananLayanan(draftForm(s, { dipilih, tanggal: {}, teks: {} })));
    expect(pesanan.total).toBe(harga!.total);
  });

  it("'Pesan layanan' sends the Layanan that remains and none of the one put back, whatever was typed for it", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayanan(draftForm(s, { dipilih: nisanDikembalikan(s), tanggal: { [s.nisan.layananId]: "2026-10-25" }, teks: { [s.nisan.layananId]: "Siti Aminah" } }));

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item).toHaveLength(1);
    expect(pesanan.item[0].label).toContain("Tabur Bunga");
  });

  it("with every Layanan put back nothing is chosen: no price is asked, no item is sent and Kirim places no order", async () => {
    const s = await siap();
    const dipilih = pilihVarian(pilihVarian({}, s.nisan.layananId, s.nisan.varianId), s.nisan.layananId, "");

    expect(varianDipilih(dipilih)).toEqual([]);
    expect(await hargaPilihanLayanan({ lokasiId: s.lokasi.lokasiMitra.id, layananVariantIds: varianDipilih(dipilih) })).toBeNull();
    const draft = draftForm(s, { dipilih, tanggal: {}, teks: {} });
    expect(draft.item).toEqual([]);
    // The button is off for this; were it pressed anyway, the order is refused rather than placed with no Layanan.
    expect((await kirimPesananLayanan(draft)).status).toBe("gagal");
  });

  it("the running price takes no empty variant: that is why the form never sends one", async () => {
    const s = await siap();

    // The price read is strict about what it is asked, as every boundary is; the form must not ask it about "".
    expect(await hargaPilihanLayanan({ lokasiId: s.lokasi.lokasiMitra.id, layananVariantIds: ["", s.bunga.varianId] })).toBeNull();
    expect(await hargaPilihanLayanan({ lokasiId: s.lokasi.lokasiMitra.id, layananVariantIds: [s.bunga.varianId] })).not.toBeNull();
  });
});
