/**
 * An Indonesian phone number as a family reads it: the local 0 in place of +62,
 * in groups of four after the prefix ("+6281122223333" → "0811-2222-3333"). A
 * number that is not +62 is returned as stored.
 */
export function formatTelepon(nomor: string): string {
  const digits = nomor.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+62")) return nomor;
  const local = `0${digits.slice(3)}`;
  const groups = [local.slice(0, 4)];
  for (let i = 4; i < local.length; i += 4) groups.push(local.slice(i, i + 4));
  return groups.join("-");
}
