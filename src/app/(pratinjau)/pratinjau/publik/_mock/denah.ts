/*
 * PROTOTYPE, throwaway. Mock Denah for the Lokasi Mitra with Terencana on.
 * Each Blok is a grid written as strings, one character per cell:
 *   T Tersedia · D Dipesan · I Terisi · U Terisi, tumpang only (released) ·
 *   X Tidak Tersedia · K part of a Kavling Keluarga (status from `kavling`) ·
 *   . Jalan · # Bukan Petak
 */

export type StatusPetak = "Tersedia" | "Dipesan" | "Terisi" | "Tidak Tersedia";

export type Sel =
  | { jenis: "petak"; nomor: string; status: StatusPetak; tumpangSaja: boolean; kavling?: string; r: number; c: number }
  | { jenis: "jalan"; r: number; c: number }
  | { jenis: "bukan"; r: number; c: number };

export type Kavling = { nomor: string; r: number; c: number; h: number; w: number; status: "Tersedia" | "Dipesan"; jenisMakam: string };

export type Blok = {
  id: string;
  nama: string;
  prefix: string;
  jenisMakam: string;
  sel: Sel[][];
  kavling: Kavling[];
};

type BlokSpec = { id: string; nama: string; prefix: string; jenisMakam: string; rows: string[]; kavling?: Kavling[] };

function build(spec: BlokSpec): Blok {
  let n = 0;
  const kavling = spec.kavling ?? [];
  const sel = spec.rows.map((row, r) =>
    [...row].map((ch, c): Sel => {
      if (ch === ".") return { jenis: "jalan", r, c };
      if (ch === "#") return { jenis: "bukan", r, c };
      n += 1;
      const nomor = `${spec.prefix}-${String(n).padStart(2, "0")}`;
      if (ch === "K") {
        const k = kavling.find((k) => r >= k.r && r < k.r + k.h && c >= k.c && c < k.c + k.w);
        return { jenis: "petak", nomor, status: k?.status ?? "Tidak Tersedia", tumpangSaja: false, kavling: k?.nomor, r, c };
      }
      const status: StatusPetak = ch === "T" ? "Tersedia" : ch === "D" ? "Dipesan" : ch === "X" ? "Tidak Tersedia" : "Terisi";
      return { jenis: "petak", nomor, status, tumpangSaja: ch === "U", r, c };
    }),
  );
  return { id: spec.id, nama: spec.nama, prefix: spec.prefix, jenisMakam: spec.jenisMakam, sel, kavling };
}

export type Denah = {
  bloks: Blok[];
  /** Mock: this Petak is taken by another family while the Pemesan is still choosing. */
  baruSajaDipesan: string;
};

export const DENAH: Record<string, Denah> = {
  "taman-peristirahatan-hijau-asri": {
    baruSajaDipesan: "A-19",
    bloks: [
      build({
        id: "a",
        nama: "Blok A",
        prefix: "A",
        jenisMakam: "standar",
        rows: [
          "IIIU.IIDTTTTX",
          "IIII.ITTTTTTT",
          ".............",
          "TTDD.TTTTTT##",
          "TTTT.TTTTIID#",
          ".............",
          "KKKK.TTTT####",
          "KKKK.TTTT####",
        ],
        kavling: [
          { nomor: "KK-A1", r: 6, c: 0, h: 2, w: 2, status: "Tersedia", jenisMakam: "kavling" },
          { nomor: "KK-A2", r: 6, c: 2, h: 2, w: 2, status: "Dipesan", jenisMakam: "kavling" },
        ],
      }),
      build({
        id: "b",
        nama: "Blok B",
        prefix: "B",
        jenisMakam: "standar",
        rows: ["TTTT.##TTT", "TTIT.##TIT", "..........", "TTTTTT.TTT", "TDTTTT.TTX"],
      }),
      build({
        id: "melati",
        nama: "Blok Melati",
        prefix: "M",
        jenisMakam: "premium",
        rows: ["IIDI.IID", "IXII.DII", "####.III", "####.IIX"],
      }),
    ],
  },
  "pemakaman-wakaf-al-ikhlas": {
    baruSajaDipesan: "U-15",
    bloks: [
      build({
        id: "utama",
        nama: "Blok Utama",
        prefix: "U",
        jenisMakam: "umum",
        rows: ["IIIIII.IIII", "IIDIII.ITTT", "...........", "TTTTTT.KKKK", "TTTTTT.KKKK"],
        kavling: [
          { nomor: "KK-U1", r: 3, c: 7, h: 1, w: 2, status: "Tersedia", jenisMakam: "kavling" },
          { nomor: "KK-U2", r: 3, c: 9, h: 1, w: 2, status: "Dipesan", jenisMakam: "kavling" },
          { nomor: "KK-U3", r: 4, c: 7, h: 1, w: 2, status: "Tersedia", jenisMakam: "kavling" },
          { nomor: "KK-U4", r: 4, c: 9, h: 1, w: 2, status: "Dipesan", jenisMakam: "kavling" },
        ],
      }),
    ],
  },
};

export function semuaPetak(blok: Blok) {
  return blok.sel.flat().filter((s): s is Extract<Sel, { jenis: "petak" }> => s.jenis === "petak");
}

/** Pickable units in a Blok: Tersedia Petak outside a Kavling, plus each Tersedia Kavling as one. */
export function jumlahTersedia(blok: Blok) {
  return semuaPetak(blok).filter((p) => p.status === "Tersedia" && !p.kavling).length + blok.kavling.filter((k) => k.status === "Tersedia").length;
}

export function jumlahTersediaDenah(denah: Denah) {
  return denah.bloks.reduce((n, b) => n + jumlahTersedia(b), 0);
}
