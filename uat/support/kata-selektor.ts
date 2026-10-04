/*
 * The words a journey looks for on a page: the name of a button or link, a label, a text, an alt text, a test id, the
 * label of a select, the name of a form field. `tests/uat/kata-di-sumber.test.ts` checks each is still somewhere in the
 * app's source, which is the only check a journey gets while it cannot be run against a stack. Used by the tests only.
 *
 * Only a word that is written out is taken: a variable, a template or a helper's result is data, not a word of the
 * page, and a pattern with a number, a group or an anchor in it (`/MKM-\d{4}/`, `/^Layanan (hari ini|akan datang)$/`)
 * is matched against data too.
 */

export type JenisKata = "role" | "label" | "text" | "testid" | "alt" | "opsi" | "field";

export interface Kata {
  jenis: JenisKata;
  kata: string;
  /** Present (true) when the journey asserts the page does NOT show it (`toHaveCount(0)`): an error page's words, never in the app. */
  negatif?: true;
}

/** A string literal (group `s`) or a regular expression literal (group `r`). */
const LITERAL = String.raw`(?:"(?<s>(?:[^"\\\n]|\\.)*)"|\/(?<r>(?:[^/\\\n*]|\\.)(?:[^/\\\n]|\\.)*)\/[a-z]*)`;

const ATURAN: [JenisKata, RegExp][] = [
  ["role", new RegExp(String.raw`getByRole\(\s*"[a-z]+"\s*,\s*\{[^}]*?\bname:\s*${LITERAL}`, "g")],
  ["label", new RegExp(String.raw`getByLabel\(\s*${LITERAL}`, "g")],
  ["text", new RegExp(String.raw`getByText\(\s*${LITERAL}`, "g")],
  ["testid", new RegExp(String.raw`getByTestId\(\s*${LITERAL}`, "g")],
  ["alt", new RegExp(String.raw`getByAltText\(\s*${LITERAL}`, "g")],
  ["opsi", new RegExp(String.raw`pilihOpsi\(\s*[A-Za-z0-9_$]+\s*,\s*${LITERAL}`, "g")],
  ["field", /\[name="(?<s>[^"]+)"\]/g],
];

/** The words in a regular expression's source when it is plain words (alternatives allowed), nothing otherwise. */
function kataDariPola(isi: string): string[] {
  const tanpaEscapeBiasa = isi.replace(/\\[./\-:,!&'" ]/g, "");
  if (/[\\^$()[\]{}+*?]/.test(tanpaEscapeBiasa)) return [];
  return isi
    .split("|")
    .map((bagian) => bagian.replace(/\\(.)/g, "$1").trim())
    .filter(Boolean);
}

function tanpaEscape(isi: string): string {
  return isi.replace(/\\(.)/g, "$1");
}

/** Every word the code looks for, in the order it appears. */
export function kataPencarian(kode: string): Kata[] {
  const ditemukan: { indeks: number; kata: Kata[] }[] = [];
  for (const [jenis, pola] of ATURAN) {
    for (const cocok of kode.matchAll(pola)) {
      const { s, r } = cocok.groups ?? {};
      const kata = s !== undefined ? [tanpaEscape(s)] : r !== undefined ? kataDariPola(r) : [];
      const sesudah = kode.slice(cocok.index + cocok[0].length).split(/[;\n]/, 1)[0];
      const negatif = /toHaveCount\(0\)|\.not\.toBeVisible\(/.test(sesudah);
      ditemukan.push({ indeks: cocok.index, kata: kata.filter((satu) => satu !== "").map((satu) => ({ jenis, kata: satu, ...(negatif ? { negatif: true as const } : {}) })) });
    }
  }
  return ditemukan.sort((a, b) => a.indeks - b.indeks).flatMap((satu) => satu.kata);
}

/**
 * Patterns for the words a page assembles from a template literal (`Menu ${peran}`, `Pembayaran online (${saluran})`):
 * the written-out parts in order, anything where a value goes. A word found by one of them is as good as a word found as is.
 */
export function polaDariTemplate(sumber: string): RegExp[] {
  const hasil: RegExp[] = [];
  for (const cocok of sumber.matchAll(/`((?:[^`\\]|\\.)*\$\{(?:[^`\\]|\\.)*)`/g)) {
    const bagian = cocok[1].split(/\$\{[^}]*\}/);
    if (bagian.join("").trim().length < 4) continue;
    const pola = bagian.map((teks) => teks.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]{0,80}");
    hasil.push(new RegExp(`^${pola}$`));
  }
  return hasil;
}
