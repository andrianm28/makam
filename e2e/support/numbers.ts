/** A WhatsApp number as typed on a form and in the canonical +62 form the site shows. */
export interface E2eNumber {
  typed: string;
  canonical: string;
}

/** A number that has never been used: no account and no orders. */
export function coldNumber(): E2eNumber {
  const subscriber = `8${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`;
  return { typed: `0${subscriber}`, canonical: `+62${subscriber}` };
}
