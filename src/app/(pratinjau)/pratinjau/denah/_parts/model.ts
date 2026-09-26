/*
 * PROTOTYPE, throwaway. The Denah editor's state model and rules, as plain
 * functions over client state. In the real build every rule here belongs in
 * the inventory domain module; nothing here is meant to be reused as is.
 */

export type JenisSel = "petak" | "jalan" | "bukan";

export type JenisMakam = { id: string; nama: string; untuk: "petak" | "kavling"; warna: 1 | 2 | 3 | 4 | 5 };

/** A mock Hak Pakai on a Petak (or its Kavling Keluarga): the Petak is "used". */
export type HakPakaiMock = {
  pemegangHak: string;
  status: "Dipesan" | "Terisi";
  pemakaman: { almarhum: string; tanggal: string }[];
  /** Hak Pakai ended, no Pembongkaran yet: stays Terisi, sellable only as tumpang. */
  tumpangSaja?: boolean;
};

export type Sel = {
  id: string;
  jenis: JenisSel;
  nomor: string | null;
  jenisMakam: string | null;
  perluVerifikasi: boolean;
  tidakTersedia?: boolean;
  hakPakai?: HakPakaiMock;
  kavling?: string;
};

export type Kavling = { nomor: string; jenisMakam: string; sel: string[]; hakPakai?: HakPakaiMock };

export type Blok = { id: string; nama: string; pola: string; grid: Sel[][]; kavling: Kavling[] };

export type Lokasi = { jenisMakam: JenisMakam[]; bloks: Blok[] };

export type StatusPetak = "Tersedia" | "Dipesan" | "Terisi" | "Tidak Tersedia";

export type Hasil<T> = { ok: true; nilai: T; catatan?: string } | { ok: false; alasan: string };

let seq = 0;
const newId = () => `s${++seq}`;

// ---------- reading ----------

export function statusPetak(sel: Sel, blok: Blok): StatusPetak {
  const kav = sel.kavling ? blok.kavling.find((k) => k.nomor === sel.kavling) : undefined;
  const hp = kav?.hakPakai ?? sel.hakPakai;
  if (hp) return hp.status;
  if (sel.tidakTersedia) return "Tidak Tersedia";
  return "Tersedia";
}

/** Used = has (or had) a Hak Pakai or a Pemakaman: can't be deleted, moved or retyped. */
export function dipakai(sel: Sel, blok: Blok) {
  if (sel.hakPakai) return true;
  const kav = sel.kavling ? blok.kavling.find((k) => k.nomor === sel.kavling) : undefined;
  return Boolean(kav?.hakPakai);
}

export function posisi(blok: Blok, id: string): { r: number; c: number } | null {
  for (let r = 0; r < blok.grid.length; r++) {
    const c = blok.grid[r].findIndex((s) => s.id === id);
    if (c >= 0) return { r, c };
  }
  return null;
}

export function semuaSel(blok: Blok) {
  return blok.grid.flat();
}

export function namaBlok(blok: Blok) {
  return `Blok ${blok.nama}`;
}

function semuaNomorMakam(lokasi: Lokasi, kecuali: Set<string> = new Set()) {
  const out = new Map<string, string>();
  for (const b of lokasi.bloks) for (const s of semuaSel(b)) if (s.nomor && !kecuali.has(s.id)) out.set(s.nomor.toLowerCase(), namaBlok(b));
  return out;
}

function semuaNomorKavling(lokasi: Lokasi) {
  const out = new Map<string, string>();
  for (const b of lokasi.bloks) for (const k of b.kavling) out.set(k.nomor.toLowerCase(), namaBlok(b));
  return out;
}

export function ringkasan(blok: Blok, lokasi: Lokasi) {
  const sel = semuaSel(blok);
  const petak = sel.filter((s) => s.jenis === "petak");
  const perJenis = new Map<string, number>();
  for (const s of petak) if (!s.kavling && s.jenisMakam) perJenis.set(s.jenisMakam, (perJenis.get(s.jenisMakam) ?? 0) + 1);
  for (const k of blok.kavling) perJenis.set(k.jenisMakam, (perJenis.get(k.jenisMakam) ?? 0) + 1);
  return {
    petak: petak.length,
    jalan: sel.filter((s) => s.jenis === "jalan").length,
    bukan: sel.filter((s) => s.jenis === "bukan").length,
    kavling: blok.kavling.length,
    petakDalamKavling: petak.filter((s) => s.kavling).length,
    perluVerifikasi: petak.filter((s) => s.perluVerifikasi).length,
    dipakai: petak.filter((s) => dipakai(s, blok)).length,
    perJenis: lokasi.jenisMakam.filter((j) => perJenis.has(j.id)).map((j) => ({ jenis: j, jumlah: perJenis.get(j.id)! })),
  };
}

// ---------- numbering ----------

/** "A-{nn}" + 7 → "A-07". Tokens: {n}, {nn}, {nnn}. */
export function nomorDariPola(pola: string, n: number) {
  return pola.replace(/\{(n+)\}/, (_, d: string) => String(n).padStart(d.length, "0"));
}

export function polaSah(pola: string) {
  return /\{n+\}/.test(pola);
}

/** "A-{nn}" → "A-K{nn}": the default Nomor Kavling pattern of a Blok. */
export function polaKavling(pola: string) {
  return pola.replace(/\{(n+)\}/, "K{$1}");
}

function nomorBerikut(blok: Blok, lokasi: Lokasi, pakai: Set<string>) {
  const ada = semuaNomorMakam(lokasi);
  for (let n = 1; n < 10000; n++) {
    const nomor = nomorDariPola(blok.pola, n);
    if (!ada.has(nomor.toLowerCase()) && !pakai.has(nomor.toLowerCase())) {
      pakai.add(nomor.toLowerCase());
      return nomor;
    }
  }
  return null;
}

export function nomorKavlingBerikut(blok: Blok, lokasi: Lokasi) {
  const ada = semuaNomorKavling(lokasi);
  const pola = polaKavling(blok.pola);
  for (let n = 1; n < 1000; n++) {
    const nomor = nomorDariPola(pola, n);
    if (!ada.has(nomor.toLowerCase())) return nomor;
  }
  return "";
}

// ---------- building ----------

function petakBaru(nomor: string | null, jenisMakam: string | null): Sel {
  return { id: newId(), jenis: "petak", nomor, jenisMakam, perluVerifikasi: true };
}

export function jenisMakamUtama(blok: Blok, lokasi: Lokasi) {
  const hitung = new Map<string, number>();
  for (const s of semuaSel(blok)) if (s.jenis === "petak" && !s.kavling && s.jenisMakam) hitung.set(s.jenisMakam, (hitung.get(s.jenisMakam) ?? 0) + 1);
  const top = [...hitung.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? lokasi.jenisMakam.find((j) => j.untuk === "petak")?.id ?? null;
}

export type BlokBaruInput = { nama: string; baris: number; kolom: number; pola: string; jenisMakam: string };

export function cekBlokBaru(lokasi: Lokasi, input: BlokBaruInput): { nama?: string; ukuran?: string; pola?: string } {
  const err: { nama?: string; ukuran?: string; pola?: string } = {};
  const nama = input.nama.trim();
  if (!nama) err.nama = "Isi nama Blok.";
  else if (lokasi.bloks.some((b) => b.nama.toLowerCase() === nama.toLowerCase()))
    err.nama = `Blok ${nama} sudah ada di Lokasi ini. Nama Blok tidak boleh sama.`;
  if (!(input.baris >= 1 && input.baris <= 40 && input.kolom >= 1 && input.kolom <= 40)) err.ukuran = "Baris dan kolom masing-masing 1 sampai 40.";
  if (!polaSah(input.pola)) err.pola = "Pola perlu tempat nomor urut, misalnya {nn} untuk 01, 02, 03.";
  else if (!err.ukuran) {
    const ada = semuaNomorMakam(lokasi);
    const bentrok: string[] = [];
    for (let n = 1; n <= input.baris * input.kolom && bentrok.length < 3; n++) {
      const nomor = nomorDariPola(input.pola, n);
      if (ada.has(nomor.toLowerCase())) bentrok.push(`${nomor} (${ada.get(nomor.toLowerCase())})`);
    }
    if (bentrok.length) err.pola = `Nomor Makam harus unik di Lokasi ini; sudah dipakai: ${bentrok.join(", ")}.`;
  }
  return err;
}

export function buatBlok(lokasi: Lokasi, input: BlokBaruInput): Blok {
  let n = 0;
  const grid = Array.from({ length: input.baris }, () =>
    Array.from({ length: input.kolom }, () => petakBaru(nomorDariPola(input.pola, ++n), input.jenisMakam)),
  );
  return { id: `b${Date.now()}`, nama: input.nama.trim(), pola: input.pola, grid, kavling: [] };
}

// ---------- editing (each returns a new Blok, or a refusal) ----------

function klon(blok: Blok): Blok {
  return { ...blok, grid: blok.grid.map((row) => row.map((s) => ({ ...s }))), kavling: blok.kavling.map((k) => ({ ...k, sel: [...k.sel] })) };
}

function daftarNomor(sel: Sel[], max = 4) {
  const list = sel.map((s) => s.nomor ?? "sel").slice(0, max);
  return list.join(", ") + (sel.length > max ? ` dan ${sel.length - max} lainnya` : "");
}

/** Why a selected cell can't take a bulk change: used, or part of a Kavling Keluarga. */
function pisahkanTerkunci(blok: Blok, ids: string[], kavlingJugaTerkunci: boolean) {
  const bisa: Sel[] = [];
  const pakai: Sel[] = [];
  const kav: Sel[] = [];
  for (const s of semuaSel(blok)) {
    if (!ids.includes(s.id)) continue;
    if (s.jenis === "petak" && dipakai(s, blok)) pakai.push(s);
    else if (kavlingJugaTerkunci && s.kavling) kav.push(s);
    else bisa.push(s);
  }
  const catatan = [
    pakai.length ? `${pakai.length} petak dilewati karena punya Hak Pakai (${daftarNomor(pakai)}).` : "",
    kav.length ? `${kav.length} petak dilewati karena bagian dari Kavling Keluarga; pisahkan kavlingnya dulu (${daftarNomor(kav)}).` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { bisa, catatan: catatan || undefined };
}

export function ubahJenisSel(lokasi: Lokasi, blok: Blok, ids: string[], jenis: JenisSel): Hasil<Blok> {
  const { bisa, catatan } = pisahkanTerkunci(blok, ids, true);
  const target = bisa.filter((s) => s.jenis !== jenis);
  if (!target.length) return catatan ? { ok: false, alasan: catatan } : { ok: false, alasan: "Sel yang dipilih sudah jenis itu." };
  const b = klon(blok);
  const pakai = new Set<string>();
  const utama = jenisMakamUtama(blok, lokasi);
  const targetIds = new Set(target.map((s) => s.id));
  // Numbers are assigned in reading order, so a new run of Petak reads naturally.
  for (const row of b.grid)
    for (let c = 0; c < row.length; c++) {
      const s = row[c];
      if (!targetIds.has(s.id)) continue;
      if (jenis === "petak") row[c] = { ...petakBaru(nomorBerikut(b, lokasi, pakai), utama), id: s.id };
      else row[c] = { id: s.id, jenis, nomor: null, jenisMakam: null, perluVerifikasi: false };
    }
  return { ok: true, nilai: b, catatan };
}

export function aturJenisMakam(blok: Blok, ids: string[], jenisMakam: string): Hasil<Blok> {
  const { bisa, catatan } = pisahkanTerkunci(blok, ids, true);
  const target = bisa.filter((s) => s.jenis === "petak");
  if (!target.length) return { ok: false, alasan: catatan ?? "Pilih paling sedikit satu Petak Makam; Jalan dan Bukan Petak tidak punya Jenis Makam." };
  const b = klon(blok);
  const t = new Set(target.map((s) => s.id));
  for (const row of b.grid) for (const s of row) if (t.has(s.id)) s.jenisMakam = jenisMakam;
  return { ok: true, nilai: b, catatan };
}

/** Renumber the selected Petak in reading order (row by row, left to right). */
export function ubahNomor(lokasi: Lokasi, blok: Blok, ids: string[], pola: string, mulai: number): Hasil<Blok> {
  if (!polaSah(pola)) return { ok: false, alasan: "Pola perlu tempat nomor urut, misalnya {nn}." };
  const { bisa, catatan } = pisahkanTerkunci(blok, ids, false);
  const target = bisa.filter((s) => s.jenis === "petak");
  if (!target.length) return { ok: false, alasan: catatan ?? "Pilih paling sedikit satu Petak Makam." };
  const ada = semuaNomorMakam(lokasi, new Set(target.map((s) => s.id)));
  const baru = target.map((_, i) => nomorDariPola(pola, mulai + i));
  const bentrok = baru.filter((n) => ada.has(n.toLowerCase()));
  if (bentrok.length)
    return { ok: false, alasan: `Nomor Makam harus unik di Lokasi ini. Sudah dipakai: ${bentrok.slice(0, 4).map((n) => `${n} (${ada.get(n.toLowerCase())})`).join(", ")}.` };
  const b = klon(blok);
  const map = new Map(target.map((s, i) => [s.id, baru[i]]));
  for (const row of b.grid) for (const s of row) if (map.has(s.id)) s.nomor = map.get(s.id)!;
  return { ok: true, nilai: b, catatan: catatan ? `${catatan} Nomor Makam petak yang punya Hak Pakai hanya bisa diubah Admin Platform.` : undefined };
}

export function ubahSatuNomor(lokasi: Lokasi, blok: Blok, id: string, nomor: string): Hasil<Blok> {
  const n = nomor.trim();
  if (!n) return { ok: false, alasan: "Isi Nomor Makam." };
  const ada = semuaNomorMakam(lokasi, new Set([id]));
  if (ada.has(n.toLowerCase())) return { ok: false, alasan: `${n} sudah dipakai di ${ada.get(n.toLowerCase())}. Nomor Makam harus unik di Lokasi ini.` };
  const b = klon(blok);
  for (const row of b.grid) for (const s of row) if (s.id === id) s.nomor = n;
  return { ok: true, nilai: b };
}

/** At least 2 Petak, all free, connected through shared edges (never diagonals). */
export function cekKavling(blok: Blok, ids: string[]): Hasil<Sel[]> {
  const sel = semuaSel(blok).filter((s) => ids.includes(s.id));
  const bukanPetak = sel.filter((s) => s.jenis !== "petak");
  if (bukanPetak.length) return { ok: false, alasan: "Kavling Keluarga hanya dari Petak Makam. Lepaskan Jalan dan Bukan Petak dari pilihan." };
  if (sel.length < 2) return { ok: false, alasan: "Kavling Keluarga paling sedikit 2 petak. Pilih petak lain yang bersebelahan." };
  const pakai = sel.filter((s) => dipakai(s, blok));
  if (pakai.length) return { ok: false, alasan: `${daftarNomor(pakai)} sudah punya Hak Pakai, jadi tidak bisa dijadikan Kavling Keluarga.` };
  const lain = sel.filter((s) => s.kavling);
  if (lain.length) return { ok: false, alasan: `${daftarNomor(lain)} sudah bagian dari Kavling Keluarga ${lain[0].kavling}.` };
  // Flood fill over edges.
  const pos = new Map(sel.map((s) => [s.id, posisi(blok, s.id)!]));
  const key = (r: number, c: number) => `${r}:${c}`;
  const byPos = new Map(sel.map((s) => [key(pos.get(s.id)!.r, pos.get(s.id)!.c), s.id]));
  const seen = new Set([sel[0].id]);
  const stack = [sel[0].id];
  while (stack.length) {
    const { r, c } = pos.get(stack.pop()!)!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = byPos.get(key(r + dr, c + dc));
      if (id && !seen.has(id)) {
        seen.add(id);
        stack.push(id);
      }
    }
  }
  if (seen.size !== sel.length) {
    const lepas = sel.filter((s) => !seen.has(s.id));
    return {
      ok: false,
      alasan: `Petak dalam satu Kavling Keluarga harus bersambung sisi, bukan hanya bersentuhan sudut. ${daftarNomor(lepas)} tidak tersambung ke ${daftarNomor(sel.filter((s) => seen.has(s.id)), 2)}.`,
    };
  }
  return { ok: true, nilai: sel };
}

export function buatKavling(lokasi: Lokasi, blok: Blok, ids: string[], nomor: string, jenisMakam: string): Hasil<Blok> {
  const cek = cekKavling(blok, ids);
  if (!cek.ok) return cek;
  const n = nomor.trim();
  if (!n) return { ok: false, alasan: "Isi Nomor Kavling." };
  const ada = semuaNomorKavling(lokasi);
  if (ada.has(n.toLowerCase())) return { ok: false, alasan: `${n} sudah dipakai di ${ada.get(n.toLowerCase())}. Nomor Kavling harus unik di Lokasi ini.` };
  const b = klon(blok);
  const t = new Set(ids);
  for (const row of b.grid) for (const s of row) if (t.has(s.id)) s.kavling = n;
  b.kavling.push({ nomor: n, jenisMakam, sel: [...ids] });
  return { ok: true, nilai: b };
}

export function pisahkanKavling(blok: Blok, nomor: string): Hasil<Blok> {
  const k = blok.kavling.find((x) => x.nomor === nomor);
  if (!k) return { ok: false, alasan: "Kavling tidak ditemukan." };
  if (k.hakPakai) return { ok: false, alasan: `Kavling Keluarga ${nomor} punya Hak Pakai, jadi tidak bisa dipisahkan. Satu Hak Pakai berlaku untuk seluruh kavling.` };
  const b = klon(blok);
  b.kavling = b.kavling.filter((x) => x.nomor !== nomor);
  for (const row of b.grid) for (const s of row) if (s.kavling === nomor) delete s.kavling;
  return { ok: true, nilai: b };
}

export type Tepi = "atas" | "bawah" | "kiri" | "kanan";

export function tambahTepi(lokasi: Lokasi, blok: Blok, tepi: Tepi): Hasil<Blok> {
  const b = klon(blok);
  const pakai = new Set<string>();
  const utama = jenisMakamUtama(blok, lokasi);
  const baru = () => petakBaru(nomorBerikut(b, lokasi, pakai), utama);
  const cols = b.grid[0]?.length ?? 0;
  if (tepi === "atas") b.grid.unshift(Array.from({ length: cols }, baru));
  if (tepi === "bawah") b.grid.push(Array.from({ length: cols }, baru));
  if (tepi === "kiri") for (const row of b.grid) row.unshift(baru());
  if (tepi === "kanan") for (const row of b.grid) row.push(baru());
  return { ok: true, nilai: b };
}

export function hapusBarisKolom(blok: Blok, arah: "baris" | "kolom", indeks: number[]): Hasil<Blok> {
  const kena = new Set(indeks);
  const sel = blok.grid.flatMap((row, r) => row.filter((_, c) => kena.has(arah === "baris" ? r : c)));
  const label = arah === "baris" ? `baris ${indeks.map((i) => i + 1).join(", ")}` : `kolom ${indeks.map((i) => i + 1).join(", ")}`;
  const pakai = sel.filter((s) => s.jenis === "petak" && dipakai(s, blok));
  if (pakai.length)
    return { ok: false, alasan: `${label[0].toUpperCase()}${label.slice(1)} tidak bisa dihapus karena ${daftarNomor(pakai)} punya Hak Pakai. Petak yang pernah dipakai tidak bisa dihapus.` };
  const kav = [...new Set(sel.filter((s) => s.kavling).map((s) => s.kavling!))];
  if (kav.length) return { ok: false, alasan: `${label[0].toUpperCase()}${label.slice(1)} memotong Kavling Keluarga ${kav.join(", ")}. Pisahkan kavlingnya dulu.` };
  const rows = arah === "baris" ? blok.grid.length - kena.size : blok.grid.length;
  const cols = arah === "kolom" ? (blok.grid[0]?.length ?? 0) - kena.size : (blok.grid[0]?.length ?? 0);
  if (rows < 1 || cols < 1) return { ok: false, alasan: "Blok paling sedikit 1 baris dan 1 kolom. Untuk membuang seluruh Blok, pakai Hapus Blok." };
  const b = klon(blok);
  b.grid = arah === "baris" ? b.grid.filter((_, r) => !kena.has(r)) : b.grid.map((row) => row.filter((_, c) => !kena.has(c)));
  return { ok: true, nilai: b };
}

export function cekHapusBlok(blok: Blok): Hasil<null> {
  const pakai = semuaSel(blok).filter((s) => s.jenis === "petak" && dipakai(s, blok));
  if (pakai.length) return { ok: false, alasan: `${namaBlok(blok)} tidak bisa dihapus karena ${pakai.length} petak punya Hak Pakai (${daftarNomor(pakai)}).` };
  return { ok: true, nilai: null };
}

export function gantiNamaBlok(lokasi: Lokasi, blok: Blok, nama: string): Hasil<Blok> {
  const n = nama.trim();
  if (!n) return { ok: false, alasan: "Isi nama Blok." };
  if (lokasi.bloks.some((b) => b.id !== blok.id && b.nama.toLowerCase() === n.toLowerCase())) return { ok: false, alasan: `Blok ${n} sudah ada di Lokasi ini.` };
  return { ok: true, nilai: { ...blok, nama: n } };
}

// ---------- mock data ----------

export const JENIS_MAKAM: JenisMakam[] = [
  { id: "standar", nama: "Makam Standar", untuk: "petak", warna: 2 },
  { id: "taman", nama: "Makam Taman", untuk: "petak", warna: 4 },
  { id: "anak", nama: "Makam Anak", untuk: "petak", warna: 3 },
  { id: "kavling4", nama: "Kavling Keluarga 4 Petak", untuk: "kavling", warna: 1 },
  { id: "kavling3", nama: "Kavling Keluarga 3 Petak", untuk: "kavling", warna: 5 },
];

const HP = {
  a: { pemegangHak: "Bapak Hendra Wijaya", status: "Terisi", pemakaman: [{ almarhum: "Siti Aminah binti Salim", tanggal: "14 Maret 2024" }] },
  b: { pemegangHak: "Ibu Maria Lestari", status: "Terisi", pemakaman: [{ almarhum: "Yohanes Sutrisno", tanggal: "2 Januari 2019" }] },
  d: { pemegangHak: "Bapak Rudi Hartono", status: "Dipesan", pemakaman: [] },
  u: {
    pemegangHak: "Keluarga Soebagio",
    status: "Terisi",
    pemakaman: [{ almarhum: "R. Soebagio", tanggal: "9 Agustus 1998" }],
    tumpangSaja: true,
  },
} satisfies Record<string, HakPakaiMock>;

/**
 * One character per cell: P Petak (checked) · V Petak, Perlu Verifikasi ·
 * I Terisi · U Terisi, tumpang only · D Dipesan · X Tidak Tersedia ·
 * K part of a Kavling Keluarga · . Jalan · # Bukan Petak. Lower-case t = Makam Taman.
 */
function blokDari(id: string, nama: string, pola: string, rows: string[], kavling: { nomor: string; jenisMakam: string; at: [number, number][]; hakPakai?: HakPakaiMock }[] = []): Blok {
  let n = 0;
  const grid = rows.map((row, r) =>
    [...row].map((ch, c): Sel => {
      if (ch === ".") return { id: newId(), jenis: "jalan", nomor: null, jenisMakam: null, perluVerifikasi: false };
      if (ch === "#") return { id: newId(), jenis: "bukan", nomor: null, jenisMakam: null, perluVerifikasi: false };
      const nomor = nomorDariPola(pola, ++n);
      const k = kavling.find((k) => k.at.some(([kr, kc]) => kr === r && kc === c));
      const s: Sel = { id: newId(), jenis: "petak", nomor, jenisMakam: ch === "t" ? "taman" : "standar", perluVerifikasi: ch === "V" };
      if (k) s.kavling = k.nomor;
      if (ch === "I") s.hakPakai = n % 2 ? HP.a : HP.b;
      if (ch === "U") s.hakPakai = HP.u;
      if (ch === "D") s.hakPakai = HP.d;
      if (ch === "X") s.tidakTersedia = true;
      return s;
    }),
  );
  const kav: Kavling[] = kavling.map((k) => ({
    nomor: k.nomor,
    jenisMakam: k.jenisMakam,
    hakPakai: k.hakPakai,
    sel: k.at.map(([r, c]) => grid[r][c].id),
  }));
  return { id, nama, pola, grid, kavling: kav };
}

export function lokasiBerisi(): Lokasi {
  return {
    jenisMakam: JENIS_MAKAM,
    bloks: [
      blokDari(
        "a",
        "A",
        "A-{nn}",
        [
          "IIIU.IIDPPPPX",
          "IIII.IPPPPPPP",
          ".............",
          "PPDD.PPPPPP##",
          "PPPP.PPPPIID#",
          ".............",
          "KKKK.KKPPVVVV",
          "KKKK.KPPPVVVV",
        ],
        [
          { nomor: "A-K01", jenisMakam: "kavling4", at: [[6, 0], [6, 1], [7, 0], [7, 1]] },
          { nomor: "A-K02", jenisMakam: "kavling4", at: [[6, 2], [6, 3], [7, 2], [7, 3]], hakPakai: HP.d },
          { nomor: "A-K03", jenisMakam: "kavling3", at: [[6, 5], [6, 6], [7, 5]] },
        ],
      ),
      blokDari("melati", "Melati", "M-{nn}", ["IIDI.ttt", "IXII.ttt", "####.ttt", "####.VVV"]),
    ],
  };
}

export function lokasiKosong(): Lokasi {
  return { jenisMakam: JENIS_MAKAM, bloks: [] };
}
