/**
 * The Layanan order's Kirim at a DKI TPU, for the payload the family-side form builds (spec, Layanan > Order;
 * stories 85 and 86; ticket 115). The form is filled the way a Pemesan fills it, `itemPesananLayanan` turns what
 * they typed into the `item` the form sends (the same function the form calls), and the real Server Action
 * answers. The question here is whether what the Pemesan chose and typed is what reaches the order; what the
 * order is priced at and when its Pekerjaan Layanan is scheduled are the Layanan module's own tests
 * (`src/domain/layanan/tpu.test.ts`).
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB: a Batu Nisan with a 7-day lead time may be asked for
 * from 8 Oktober, a Bunga Tabur with a 1-day lead time from 2 Oktober.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { layananOnTestDatabase, newLayananFor } from "../../../../tests/support/layanan";
import { orderTpu, siapTpu } from "../../../../tests/support/layanan-tpu";
import { itemPesananLayanan, type IsianLayanan } from "../item-pesanan";
import { kirimPesananLayananTpu } from "./actions";
import { tampilanPesananTpu } from "./tampilan";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { db, close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/**
 * A DKI TPU that offers a Batu Nisan (which asks for the Tulisan pada nisan) and a Bunga Tabur (which asks for
 * nothing) at DKI prices, and a Pemesan signed in. `tampilan` is what the order page hands the form.
 */
async function siap() {
  const setup = layananOnTestDatabase(db);
  const dasar = await siapTpu(setup);
  const nisan = await newLayananFor(setup, dasar.admin, {
    name: "Batu Nisan",
    jenis: "nisan",
    teksLabel: "Tulisan pada nisan",
    leadTimeDays: 7,
    bisaHariH: false,
    varian: ["Granit Abu-abu 80×100"],
  });
  const tanda = await setup.layanan.tandaiBolehDiTpu(dasar.admin, nisan.varian.id, { boleh: true, reason: null });
  if (!tanda.ok) throw new Error(`tandai refused: ${tanda.reason}`);
  const harga = await setup.tariffs.setHargaLayananDki(dasar.admin, nisan.varian.id, { amount: 1_200_007, effectiveOn: "2026-10-01", reason: null });
  if (!harga.ok) throw new Error(`harga DKI refused: ${harga.reason}`);

  const login = await server.logIn("keluarga.tpu@contoh.id");
  browser.store(login.session.cookies);
  const pemesan = { accountId: login.account.id, email: login.account.email };
  const tampilan = await tampilanPesananTpu(null);
  const layananBunga = tampilan.layanan.find((satu) => satu.name === "Bunga Tabur");
  if (!layananBunga) throw new Error("the page does not offer Bunga Tabur");
  return {
    tpu: dasar.tpu,
    nisan: { layananId: nisan.layanan.id, varianId: nisan.varian.id },
    bunga: { layananId: layananBunga.id, varianId: dasar.bunga.id },
    pemesan,
    tampilan,
  };
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

/** What "Pesan layanan" sends: the described grave and the Pemesan's own fields, and the items the Layanan fields add up to. */
function draftForm(s: Siap, isi: IsianLayanan) {
  return orderTpu(s, itemPesananLayanan(s.tampilan.layanan, isi));
}

/** The order as its Pemesan reads it back, by the Nomor Pemesanan the Kirim answered with. */
async function pesananDibaca(s: Siap, hasil: Awaited<ReturnType<typeof kirimPesananLayananTpu>>) {
  if (hasil.status !== "selesai") throw new Error(`order not placed: ${JSON.stringify(hasil)}`);
  const pesanan = await server.runtime().layanan.pesananTpuOf(hasil.nomor, s.pemesan);
  if (!pesanan) throw new Error("the order cannot be read back");
  return pesanan;
}

describe("Kirim of a Layanan order at a DKI TPU, for the payload the form builds", () => {
  it("a Batu Nisan with the Tulisan pada nisan the Pemesan typed is accepted, and the Tulisan is on its order", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayananTpu(draftForm(s, isian([{ ...s.nisan, teks: "  Hasan Basri bin Umar, wafat 2026  " }])));

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item).toHaveLength(1);
    expect(pesanan.item[0].label).toContain("Batu Nisan");
    expect(pesanan.item[0].teks).toBe("Hasan Basri bin Umar, wafat 2026");
    // No date was picked, so it is the earliest a 7-day lead time allows from 1 Oktober.
    expect(pesanan.item[0].targetDate).toBe("2026-10-08");
  });

  it("the target date the Pemesan picked is the target date of the order, not the earliest the lead time allows", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayananTpu(draftForm(s, isian([{ ...s.bunga, tanggal: "2026-10-20" }])));

    const pesanan = await pesananDibaca(s, hasil);
    expect(pesanan.item[0].label).toContain("Bunga Tabur");
    expect(pesanan.item[0].targetDate).toBe("2026-10-20");
  });

  it("a Layanan that asks for text is still refused, in its own words, while the Pemesan has typed nothing", async () => {
    const s = await siap();

    const refusal = { status: "gagal", message: "Layanan ini minta isian tambahan. Isi dulu kolomnya." };
    expect(await kirimPesananLayananTpu(draftForm(s, isian([{ ...s.nisan, tanggal: "2026-10-20" }])))).toEqual(refusal);
    // Spaces are no text either.
    expect(await kirimPesananLayananTpu(draftForm(s, isian([{ ...s.nisan, tanggal: "2026-10-20", teks: "   " }])))).toEqual(refusal);
  });

  it("with no target date picked, the earliest date the Layanan's lead time allows is the order's target date", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayananTpu(draftForm(s, isian([s.bunga])));

    // Today is 1 Oktober and a Bunga Tabur has a 1-day lead time.
    expect((await pesananDibaca(s, hasil)).item[0].targetDate).toBe("2026-10-02");
  });

  it("a target date the Pemesan cleared again is the earliest date, which is what the field shows", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayananTpu(draftForm(s, isian([{ ...s.bunga, tanggal: "" }])));

    expect((await pesananDibaca(s, hasil)).item[0].targetDate).toBe("2026-10-02");
  });

  it("two Layanan ordered together each keep their own target date and text", async () => {
    const s = await siap();

    const hasil = await kirimPesananLayananTpu(
      draftForm(
        s,
        isian([
          { ...s.nisan, tanggal: "2026-10-25", teks: "Hasan Basri" },
          { ...s.bunga, tanggal: "2026-10-12" },
        ]),
      ),
    );

    const pesanan = await pesananDibaca(s, hasil);
    const dari = (label: string) => pesanan.item.find((satu) => satu.label.includes(label));
    expect(dari("Batu Nisan")).toMatchObject({ targetDate: "2026-10-25", teks: "Hasan Basri" });
    // The Bunga Tabur asks for no text, so none is sent for it.
    expect(dari("Bunga Tabur")).toMatchObject({ targetDate: "2026-10-12", teks: null });
  });
});
