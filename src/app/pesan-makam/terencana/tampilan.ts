import { formatBulanTahun } from "@/lib/format-tanggal";
import { lokasiFacilities, type LokasiFacility } from "@/domain/lokasi";
import type { BarisTotal, DenahTerencana, KartuTerencana, PemesananTerencanaOrder } from "@/domain/pemesanan";
import type { PilihanStatus } from "@/domain/inventory";
import { formatRupiah } from "@/lib/rupiah";

/**
 * What the wizard's screens show, as plain values: the module's reads turned into
 * words, amounts and ids, so a server component hands a client component
 * something it can render without reading a domain type. Wording lives here and in
 * the components; no rule does.
 */

/** One card of step 1, "Pilih lokasi". */
export interface LokasiView {
  id: string;
  name: string;
  city: string;
  /** "Terverifikasi · dikunjungi September 2026". */
  terverifikasi: string;
  /** "Rp 2.650.000" (the card's own "mulai" caption sits above it), or null while nothing here is priced. */
  mulai: string | null;
  /** "5 petak atau kavling bisa dipilih", or "Belum ada petak yang tersedia". */
  tersedia: string;
  /** Up to three facilities, by their key (for the icon) and label. */
  fasilitas: { key: LokasiFacility; label: string }[];
  /** The Kunjungan Verifikasi's first photo, signed; null before one has been taken. */
  foto: string | null;
}

export function lokasiView(kartu: KartuTerencana, foto: string | null): LokasiView {
  const visited = kartu.lokasi.kunjungan;
  return {
    id: kartu.lokasi.id,
    name: kartu.lokasi.name,
    city: kartu.lokasi.city,
    terverifikasi: visited ? `Terverifikasi · dikunjungi ${formatBulanTahun(visited.visitedOn)}` : "Terverifikasi",
    mulai: kartu.mulaiDari === null ? null : formatRupiah(kartu.mulaiDari),
    tersedia:
      kartu.tersedia > 0
        ? `${kartu.tersedia} petak atau kavling bisa dipilih`
        : "Belum ada petak yang tersedia",
    fasilitas: (kartu.lokasi.facilities as LokasiFacility[]).slice(0, 3).map((facility) => ({ key: facility, label: lokasiFacilities[facility] })),
    foto,
  };
}

/** One cell of the Denah as the picker draws it. */
export interface SelView {
  id: string;
  row: number;
  col: number;
  /** A Petak Makam, a Jalan, a Bukan Petak or a Pintu Masuk; only a Petak is pickable. */
  kind: "petak" | "jalan" | "bukan_petak" | "pintu_masuk";
  /** The Nomor Makam, or the Nomor Kavling of the Kavling Keluarga this cell belongs to. */
  nomor: string | null;
  /** The Kavling Keluarga this cell belongs to, if any: it is picked whole, never one cell of it. */
  kavling: { id: string; nomor: string } | null;
  /** The Jenis Makam that prices this cell; null for a cell that is not a unit of its own. */
  jenisMakam: string | null;
  /** The same Jenis Makam's id, for the selection's price. */
  jenisMakamId: string | null;
  status: PilihanStatus | null;
  /** A Terisi plot that can still take a tumpang: the picker says who to ask about it. */
  tumpangSaja: boolean;
}

export interface KavlingView {
  id: string;
  nomor: string;
  jenisMakamId: string;
  status: PilihanStatus;
  /** Where its outline starts and how many cells it covers, in grid coordinates. */
  row: number;
  col: number;
  rows: number;
  cols: number;
}

export interface BlokView {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** How many units of this Blok a Pemesan may pick, as the read counted them: the Blok tab's own number. */
  tersedia: number;
  cells: SelView[];
  kavling: KavlingView[];
}

/** What a priced line is called on the picker: the glossary term, plus the plot it prices. */
export interface BarisView {
  label: string;
  amount: number;
}

function barisView(line: BarisTotal): BarisView {
  switch (line.kind) {
    case "harga_hak_pakai":
      return { label: `Harga Hak Pakai · ${line.nomor ?? ""}`, amount: line.amount };
    case "biaya_layanan_platform":
      return { label: "Biaya Layanan Platform · Makam.co.id", amount: line.amount };
    case "biaya_pemakaman":
      return { label: "Biaya Pemakaman", amount: line.amount };
    default:
      return { label: line.kind, amount: line.amount };
  }
}

export interface DenahView {
  lokasi: { id: string; name: string; city: string };
  blok: BlokView[];
  /** How many units a Pemesan may pick at this Lokasi Mitra right now. */
  tersedia: number;
  /** What the chosen plots cost, priced by the domain: the lines, the total, and whether v1 may be paid for it. */
  total: { lines: BarisView[]; total: number; dalamBatas: boolean };
  /** The "Nanti" line: the current Biaya Pemakaman + Biaya Layanan Platform of one later burial. */
  nanti: { total: number; baris: BarisView[] } | null;
  /** The Syarat to be shown before Kirim, as the Lokasi Mitra's policy reads now. */
  syarat: SyaratView;
  /** The Admin Lokasi to reach about a plot that can only be a tumpang; null before one is picked. */
  kontakSiaga: { nama: string; telepon: string } | null;
}

export interface SyaratView {
  masaPembatalanDays: number;
  refundPercent: number;
  lokasiNama: string;
}

/** The Syarat Pemesanan Terencana, in the words shown before Kirim and kept on the order. */
export function syaratLines(syarat: SyaratView): string[] {
  return [
    `Masa Pembatalan ${syarat.masaPembatalanDays} hari sejak pembayaran: membatalkan Pemesanan Terencana dalam masa ini mengembalikan seluruh tarif.`,
    `Setelah masa itu, pengembalian ${syarat.refundPercent}% dari tarif, sesuai kebijakan ${syarat.lokasiNama}.`,
    `Hak Pakai diberikan oleh ${syarat.lokasiNama}; Makam.co.id mencatat dan menerima pembayarannya.`,
  ];
}

export function denahView(denah: DenahTerencana): DenahView {
  const nomorKavling = new Map(denah.blok.flatMap((blok) => blok.kavling.map((satu) => [satu.id, satu.nomorKavling] as const)));
  const jenisNama = new Map(denah.jenisMakam.map((satu) => [satu.id, satu.name] as const));
  return {
    lokasi: { id: denah.lokasi.id, name: denah.lokasi.name, city: denah.lokasi.city },
    blok: denah.blok.map((blok) => {
      const kotak = new Map<string, { row: number; col: number; rows: number; cols: number }>();
      for (const cell of blok.cells) {
        if (!cell.kavlingId) continue;
        const seen = kotak.get(cell.kavlingId);
        kotak.set(cell.kavlingId, seen ? grow(seen, cell) : { row: cell.row, col: cell.col, rows: 1, cols: 1 });
      }
      return {
        id: blok.id,
        name: blok.name,
        rows: blok.rows,
        cols: blok.cols,
        tersedia: blok.tersedia,
        cells: blok.cells.map((cell) => ({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          kind: cell.kind,
          nomor: cell.nomorMakam ?? (cell.kavlingId ? nomorKavling.get(cell.kavlingId) ?? null : null),
          kavling: cell.kavlingId ? { id: cell.kavlingId, nomor: nomorKavling.get(cell.kavlingId) ?? "" } : null,
          jenisMakam: cell.jenisMakamId ? jenisNama.get(cell.jenisMakamId) ?? null : null,
          jenisMakamId: cell.kavlingId ? null : cell.jenisMakamId,
          status: cell.status,
          tumpangSaja: cell.tumpangSaja,
        })),
        kavling: blok.kavling.map((satu) => ({
          id: satu.id,
          nomor: satu.nomorKavling,
          jenisMakamId: satu.jenisMakamId,
          status: satu.status,
          ...(kotak.get(satu.id) ?? { row: 0, col: 0, rows: 1, cols: 1 }),
        })),
      };
    }),
    tersedia: denah.tersedia,
    total: { lines: denah.total.lines.map(barisView), total: denah.total.total, dalamBatas: denah.total.dalamBatas },
    nanti: denah.nanti ? { total: denah.nanti.total, baris: denah.nanti.lines.map(barisView) } : null,
    syarat: {
      masaPembatalanDays: denah.syarat.masaPembatalanDays,
      refundPercent: denah.syarat.refundAfterMasaPembatalanPercent,
      lokasiNama: denah.syarat.lokasiNama,
    },
    // The Kontak Siaga is an Akun; its email is the only name it carries.
    kontakSiaga: denah.kontakSiaga ? { nama: denah.kontakSiaga.email ?? "Admin Lokasi", telepon: denah.kontakSiaga.phoneNumber } : null,
  };
}

/** One cell's place in a Kavling Keluarga's outline, grown to cover both cells. */
function grow(
  box: { row: number; col: number; rows: number; cols: number },
  cell: { row: number; col: number },
): { row: number; col: number; rows: number; cols: number } {
  const row = Math.min(box.row, cell.row);
  const col = Math.min(box.col, cell.col);
  return {
    row,
    col,
    rows: Math.max(box.row + box.rows, cell.row + 1) - row,
    cols: Math.max(box.col + box.cols, cell.col + 1) - col,
  };
}

/** The confirmation after Kirim: the order as its own Pemesan reads it back. */
export interface TerkirimView {
  nomor: string;
  lokasiNama: string;
  /** "2 Petak · Blok A: A-01, A-02", or "Kavling Keluarga A-K01 · 2 petak". */
  ringkasan: string;
  /** One line per held plot, as the order records it. */
  unit: string[];
  /** The Syarat, read back from the order's own snapshot. */
  syarat: string[];
}

export function terkirimView(pemesanan: PemesananTerencanaOrder, blokOf: (nomor: string) => string | null): TerkirimView {
  const kavling = pemesanan.unit.find((unit) => unit.jenis === "kavling");
  const perBlok = new Map<string, string[]>();
  for (const unit of pemesanan.unit) {
    if (unit.jenis !== "petak") continue;
    const blok = blokOf(unit.nomor) ?? "Denah";
    perBlok.set(blok, [...(perBlok.get(blok) ?? []), unit.nomor]);
  }
  const ringkasan = kavling
    ? `Kavling Keluarga ${kavling.nomor}`
    : `${pemesanan.unit.length} Petak · ${[...perBlok.entries()].map(([blok, nomor]) => `${blok}: ${nomor.join(", ")}`).join(" · ")}`;
  return {
    nomor: pemesanan.nomor,
    lokasiNama: pemesanan.lokasi.name,
    ringkasan,
    unit: pemesanan.unit.map((unit) => `${unit.jenis === "kavling" ? "Kavling Keluarga" : "Petak"} ${unit.nomor} · ${unit.jenisMakamName}`),
    syarat: syaratLines({
      masaPembatalanDays: pemesanan.syarat.masaPembatalanDays,
      refundPercent: pemesanan.syarat.refundAfterMasaPembatalanPercent,
      lokasiNama: pemesanan.syarat.lokasiNama,
    }),
  };
}
