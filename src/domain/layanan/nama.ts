/**
 * The two small rules every write in this module shares: how a name typed by
 * Admin Platform is folded to compare it, and how a reason is trimmed. One
 * place, so the catalog's "one name" rule and the Audit Log's reasons cannot
 * drift apart between files.
 */

/** A name folded for the one-name-per-catalog rule: lower case, single spaces. */
export function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** An Entri Audit's reason as typed: trimmed, and blank is none. */
export function reasonOf(reason: string | null | undefined): string | null {
  return reason?.trim() || null;
}
