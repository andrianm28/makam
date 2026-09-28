/**
 * How a family types an Almarhum's name against the name on the record
 * (spec, Inventory > lookup: "Almarhum name + year of death"). Pure, so the rule
 * is one plain unit test and never a `LIKE` pattern.
 */
import { foldKey } from "@/lib/fold-key";

/**
 * Whether `diketik` (what the family typed) names the same Almarhum as `nama`
 * (what is on the record).
 *
 * Case and spacing are the only things forgiven, because those are what a person
 * at a phone keyboard gets wrong: both sides are folded (lower case, single
 * spaces, `@/lib/fold-key`). The words themselves must be the same set, in any
 * order, so "Siti Aminah" and "Aminah Siti" are one person.
 *
 * What is deliberately **not** forgiven is a part of a name. A family typing
 * "Hasan" is not asking for the graves of "Hasan Basri" and "Hasanuddin", and
 * a common first name must not return a page of strangers: a shorter name is a
 * miss, answered with the same "not found" as any other, and the hub's next step
 * is the Nomor Makam or a human being. That is also why the typed text is
 * compared here and never handed to `LIKE`, where a typed `%` or `_` would be a
 * wildcard over every grave in the cemetery.
 */
export function namaAlmarhumCocok(nama: string, diketik: string): boolean {
  const tercatat = kataFolded(nama);
  const diketikKata = kataFolded(diketik);
  if (diketikKata.length === 0 || tercatat.length !== diketikKata.length) return false;
  const tersisa = [...tercatat];
  return diketikKata.every((kata) => {
    const di = tersisa.indexOf(kata);
    if (di === -1) return false;
    tersisa.splice(di, 1);
    return true;
  });
}

/** A name as its words, folded: order and spacing are noise, the words are not. */
function kataFolded(nama: string): string[] {
  return foldKey(nama).split(" ").filter((kata) => kata !== "");
}
