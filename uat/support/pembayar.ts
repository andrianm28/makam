/*
 * Which parts of the runner pay a Tagihan, read from their own text.
 *
 * A journey that pays must carry the @bayar tag (`npm run uat -- --grep @bayar` is everything that has to run on staging
 * before the switch), and a journey marked @tanpabayar must never pay. Which helper pays is not a list of names kept by hand,
 * which would go stale the day someone writes `lunasiTagihan`: the paying helper is the one that presses the sandbox's
 * "Simulate Payment", and every helper that calls a paying helper pays too, however deep. Used by `tests/uat`; the
 * journeys do not import it.
 */

/** The sandbox checkout's own button: the one thing only a paying helper presses. */
const TOMBOL_SANDBOX = /Simulate Payment/;

/** The text without comments, so a name that is only written in a comment is not a call. */
export function tanpaKomentar(teks: string): string {
  return teks.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

interface Fungsi {
  nama: string;
  badan: string;
}

/** The top-level functions of a file, each with the text up to the next one. */
function fungsiDi(teks: string): Fungsi[] {
  const bersih = tanpaKomentar(teks);
  const awal = [...bersih.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)];
  return awal.map((cocok, urutan) => ({ nama: cocok[1], badan: bersih.slice(cocok.index, awal[urutan + 1]?.index ?? bersih.length) }));
}

function memanggil(teks: string, nama: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_$.])${nama.replace(/\$/g, "\\$")}\\(`).test(teks);
}

/** The names of the helpers that pay: the one that presses Simulate Payment, and every helper that calls one. `berkas` maps a file name to its text. */
export function fungsiPembayar(berkas: Record<string, string>): Set<string> {
  const semua = Object.values(berkas).flatMap(fungsiDi);
  const pembayar = new Set(semua.filter((satu) => TOMBOL_SANDBOX.test(satu.badan)).map((satu) => satu.nama));
  for (let berubah = true; berubah; ) {
    berubah = false;
    for (const satu of semua) {
      if (pembayar.has(satu.nama)) continue;
      if ([...pembayar].some((nama) => memanggil(satu.badan, nama))) {
        pembayar.add(satu.nama);
        berubah = true;
      }
    }
  }
  return pembayar;
}

/** Whether `teks` (a journey, a block of it) calls a paying helper. A name in a comment does not count. */
export function membayar(teks: string, pembayar: Set<string>): boolean {
  const bersih = tanpaKomentar(teks);
  return [...pembayar].some((nama) => memanggil(bersih, nama));
}

export interface BlokDescribe {
  judul: string;
  badan: string;
}

/** The `test.describe("…", …)` blocks of a journey file (`test.describe.configure(…)` is not one); a file without any is one block. */
export function blokDescribe(teks: string): BlokDescribe[] {
  const awal = [...teks.matchAll(/^test\.describe\(\s*(?:"([^"]*)"|`([^`]*)`)/gm)];
  if (awal.length === 0) return [{ judul: "", badan: teks }];
  return awal.map((cocok, urutan) => ({ judul: cocok[1] ?? cocok[2] ?? "", badan: teks.slice(cocok.index, awal[urutan + 1]?.index ?? teks.length) }));
}

/** The tags a describe block declares (`{ tag: ["@rilis2", "@bayar"] }`), in order. */
export function tagDiBlok(badan: string): string[] {
  const daftar = /\{\s*tag:\s*\[([^\]]*)\]/.exec(badan)?.[1] ?? "";
  return [...daftar.matchAll(/"(@[A-Za-z0-9_-]+)"/g)].map((cocok) => cocok[1]);
}
