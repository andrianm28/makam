import type { QuotedLine } from "@/domain/tariffs";

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
      return "Biaya Layanan Platform";
  }
}
