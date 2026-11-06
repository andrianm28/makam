import type { QuotedLine } from "@/domain/tariffs";
import { formatRupiah } from "@/lib/rupiah";

/**
 * The name of a quote line, as every page, card and Tagihan shows it: the
 * glossary term (CONTEXT.md) with what tells two lines apart. The Tariffs
 * module carries only the facts; the wording lives here, once.
 */
export function quoteLineLabel(line: QuotedLine): string {
  switch (line.kind) {
    case "harga_hak_pakai":
      return `Harga Hak Pakai – ${line.jenisMakamName}`;
    case "biaya_pemakaman":
      return line.tumpang ? "Biaya Pemakaman (tumpang)" : "Biaya Pemakaman";
    case "perpanjangan":
      return `Perpanjangan Makam – ${line.jenisMakamName} (${line.terms} × ${line.tenure.kind === "tahun" ? `${line.tenure.years} tahun` : "selamanya"})`;
    case "biaya_pengurusan":
      return line.pengurusan === "pemakaman" ? "Biaya Pengurusan" : "Biaya Pengurusan (hanya berkas)";
    case "retribusi_pemda":
      return "Retribusi Pemda (IPTM)";
    case "biaya_layanan_platform":
      // Its two parts named on every page and Tagihan once a Biaya Administrasi is entered (rapat Ira, 6 Nov 2026).
      return line.bagian.administrasi > 0
        ? `Biaya Layanan Platform (platform ${formatRupiah(line.bagian.platform)}, administrasi ${formatRupiah(line.bagian.administrasi)})`
        : "Biaya Layanan Platform";
    case "layanan_lokasi":
    case "layanan_dki":
      // A Layanan line names no Layanan: those words belong to the Layanan module,
      // which reads its own catalog and labels its own prices.
      return "Layanan";
  }
}

/**
 * A quote line as rows of a price breakdown: the Biaya Layanan Platform as its
 * two parts, "Biaya platform" and "Biaya administrasi", once a Biaya
 * Administrasi is entered (rapat Ira, 6 Nov 2026); every other line as itself.
 */
export function quoteLineRows(line: QuotedLine): { label: string; amount: number }[] {
  if (line.kind === "biaya_layanan_platform" && line.bagian.administrasi > 0) {
    return [
      { label: "Biaya platform", amount: line.bagian.platform },
      { label: "Biaya administrasi", amount: line.bagian.administrasi },
    ];
  }
  return [{ label: quoteLineLabel(line), amount: line.amount }];
}
