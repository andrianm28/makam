/** Every account is a Pemesan; staff roles arrive with ticket 09. */
export type Role = "pemesan";

/** Who is acting: the signed-in account behind a request. */
export interface Actor {
  accountId: string;
  /** Canonical E.164 WhatsApp number. */
  phoneNumber: string;
  roles: Role[];
}
