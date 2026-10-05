/**
 * A Mitra Jasa's Pencairan as the page draws them (spec story 181; ticket 55 AC 3): each with its status and its date,
 * the jobs it covers with their Layanan, TPU, date and rate, and what it comes to. A Mitra Jasa is paid in full, so
 * no line of it is ever a Potongan. The list arrives from the Payouts read already newest first; the view keeps its order.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PencairanMitraJasaEntri, StatusPencairanMitraJasa } from "@/domain/payouts";
import { rupiahSchema } from "@/lib/rupiah";
import { DaftarPencairan } from "./daftar-pencairan";

/** Whole rupiah, as the Payouts read hands it over. */
const rp = (jumlah: number) => rupiahSchema.parse(jumlah);

const BUNGA = { itemId: "item-1", layanan: "Layanan – Bunga Tabur (Reguler)", tpu: "TPU Kober", tanggal: "2026-10-05", tarif: rp(150_000) };
const PEMBERSIHAN = { itemId: "item-2", layanan: "Layanan – Pembersihan Makam (Reguler)", tpu: "TPU Cilincing", tanggal: "2026-10-06", tarif: rp(400_003) };

function pencairan(over: Partial<PencairanMitraJasaEntri> = {}): PencairanMitraJasaEntri {
  return { kunci: "item-1", status: "belum_jatuh_tempo", tanggal: null, pekerjaan: [BUNGA], total: rp(150_000), bukti: null, ...over };
}

/** What the Mitra Jasa reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const html = (daftar: PencairanMitraJasaEntri[]) => renderToStaticMarkup(createElement(DaftarPencairan, { pencairan: daftar }));

describe("a Mitra Jasa's Pencairan on their page", () => {
  it("draws the status, and the Layanan, TPU, date and rate of the job, and the total", () => {
    const teks = bacaan(html([pencairan()]));

    expect(teks).toContain("Belum Jatuh Tempo");
    expect(teks).toContain("Layanan – Bunga Tabur (Reguler)");
    expect(teks).toContain("TPU Kober");
    expect(teks).toContain("5 Oktober 2026");
    expect(teks).toContain("Rp 150.000");
    expect(teks).toMatch(/Total Rp 150\.000/);
  });

  it("says the earliest a Belum Jatuh Tempo Pencairan can fall due, which is when the masa keluhan of its job ends", () => {
    const teks = bacaan(html([pencairan({ status: "belum_jatuh_tempo", tanggal: "2026-10-08" })]));

    expect(teks).toContain("Belum Jatuh Tempo Jatuh tempo paling cepat 8 Oktober 2026");
    expect(teks).toContain("Menunggu masa keluhan atas pekerjaan ini berakhir.");
    // The app calls it the masa keluhan; no word for word "jendela" in front of a Mitra Jasa.
    expect(teks).not.toMatch(/jendela/i);
  });

  it("draws no date for a Pencairan the read has none for, rather than a made-up one", () => {
    const teks = bacaan(html([pencairan({ status: "belum_jatuh_tempo", tanggal: null })]));

    expect(teks).toContain("Belum Jatuh Tempo");
    expect(teks).not.toMatch(/paling cepat|paling lambat|Ditransfer|sejak/);
  });

  it("says by when a Jatuh Tempo Pencairan is to be paid", () => {
    const teks = bacaan(html([pencairan({ status: "jatuh_tempo", tanggal: "2026-10-07" })]));

    expect(teks).toContain("Jatuh Tempo");
    expect(teks).not.toContain("Belum Jatuh Tempo");
    expect(teks).toContain("Dibayar paling lambat 7 Oktober 2026");
  });

  it("draws a transfer as one Pencairan with every job it covered, the amount transferred, its date and a link to its Bukti Pencairan", () => {
    const markup = html([
      pencairan({
        kunci: "BKP/2026/000001",
        status: "dicairkan",
        tanggal: "2026-10-09",
        pekerjaan: [PEMBERSIHAN, BUNGA],
        total: rp(550_003),
        bukti: { nomorBukti: "BKP/2026/000001", link: "tautan-bukti-12345" },
      }),
    ]);
    const teks = bacaan(markup);

    expect(teks).toContain("Dicairkan");
    expect(teks).toContain("Ditransfer 9 Oktober 2026");
    expect(teks).toContain("Satu transfer untuk 2 pekerjaan");
    expect(teks).toContain("Layanan – Pembersihan Makam (Reguler)");
    expect(teks).toContain("TPU Cilincing");
    expect(teks).toContain("Rp 400.003");
    expect(teks).toContain("Rp 150.000");
    expect(teks).toMatch(/Total Rp 550\.003/);
    expect(teks).toContain("BKP/2026/000001");
    expect(markup).toContain('href="/dokumen/tautan-bukti-12345"');
  });

  it("draws a Dibatalkan Pencairan as paying nothing, and a Ditahan one with the date it fell due and no date to be paid by", () => {
    const batal = bacaan(html([pencairan({ status: "dibatalkan", tanggal: "2026-10-05", total: rp(0) })]));
    expect(batal).toContain("Dibatalkan 5 Oktober 2026");
    expect(batal).toContain("Pencairan ini dibatalkan dan tidak dibayarkan.");
    expect(batal).toMatch(/Total dibayarkan Rp 0/);

    const tahan = bacaan(html([pencairan({ status: "ditahan", tanggal: "2026-10-07" })]));
    expect(tahan).toContain("Ditahan Jatuh tempo sejak 7 Oktober 2026");
    expect(tahan).toContain("Admin Platform menahan Pencairan ini untuk sementara.");
    // Admin Platform has held it back: it promises no date it will be paid by.
    expect(tahan).not.toContain("paling lambat");
  });

  it("keeps the order it is given, newest first", () => {
    const teks = bacaan(html([pencairan({ kunci: "baru", pekerjaan: [PEMBERSIHAN], total: rp(400_003) }), pencairan({ kunci: "lama" })]));

    expect(teks.indexOf("Pembersihan Makam")).toBeGreaterThan(-1);
    expect(teks.indexOf("Pembersihan Makam")).toBeLessThan(teks.indexOf("Bunga Tabur"));
  });

  it("never draws a Potongan, nor an order, a family or a Hak Pakai, whatever the status", () => {
    const statuses: StatusPencairanMitraJasa[] = ["belum_jatuh_tempo", "jatuh_tempo", "ditahan", "dicairkan", "dibatalkan"];
    const teks = bacaan(html(statuses.map((status, nomor) => pencairan({ kunci: `k${nomor}`, status, tanggal: "2026-10-07" }))));

    expect(teks).not.toMatch(/potongan|MKM-|hak pakai|almarhum|pemesan/i);
  });
});
