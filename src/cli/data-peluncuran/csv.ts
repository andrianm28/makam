/**
 * A small CSV reader for the launch data template: RFC 4180 quoting, a leading
 * byte-order mark dropped, and the delimiter taken from the header line, because
 * Excel in an Indonesian locale saves with `;` and Google Sheets with `,`.
 * Blank lines are skipped; every row comes back keyed by its header.
 */
export interface BarisCsv {
  /** The 1-based line the row starts on, counting the header as line 1. */
  nomor: number;
  nilai: Record<string, string>;
}

export function bacaCsv(teks: string): { kolom: string[]; baris: BarisCsv[] } {
  const isi = teks.replace(/^﻿/, "");
  const barisPertama = isi.split(/\r?\n/, 1)[0] ?? "";
  const pemisah = barisPertama.includes(";") && !barisPertama.includes(",") ? ";" : ",";

  const rekaman: { nomor: number; sel: string[] }[] = [];
  let sel: string[] = [];
  let kini = "";
  let dalamKutip = false;
  let nomor = 1;
  let mulai = 1;
  for (let i = 0; i < isi.length; i += 1) {
    const huruf = isi[i]!;
    if (dalamKutip) {
      if (huruf === '"' && isi[i + 1] === '"') {
        kini += '"';
        i += 1;
      } else if (huruf === '"') {
        dalamKutip = false;
      } else {
        if (huruf === "\n") nomor += 1;
        kini += huruf;
      }
    } else if (huruf === '"') {
      dalamKutip = true;
    } else if (huruf === pemisah) {
      sel.push(kini);
      kini = "";
    } else if (huruf === "\n" || huruf === "\r") {
      if (huruf === "\r" && isi[i + 1] === "\n") i += 1;
      sel.push(kini);
      rekaman.push({ nomor: mulai, sel });
      sel = [];
      kini = "";
      nomor += 1;
      mulai = nomor;
    } else {
      kini += huruf;
    }
  }
  if (kini !== "" || sel.length > 0) {
    sel.push(kini);
    rekaman.push({ nomor: mulai, sel });
  }

  const [judul, ...sisa] = rekaman;
  const kolom = (judul?.sel ?? []).map((nama) => nama.trim());
  const baris = sisa
    .filter((rekam) => rekam.sel.some((nilai) => nilai.trim() !== ""))
    .map((rekam) => ({
      nomor: rekam.nomor,
      nilai: Object.fromEntries(kolom.map((nama, indeks) => [nama, (rekam.sel[indeks] ?? "").trim()])),
    }));
  return { kolom, baris };
}
