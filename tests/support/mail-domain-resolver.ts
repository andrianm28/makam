import type { MailDomainResolver } from "@/adapters/live/mail-domain";

/**
 * A DNS in which every domain has a mail host. A test of the live EmailSender
 * that is not about the address check gives it this one, so it depends neither
 * on the network nor on what a name happens to resolve to.
 */
export const mailEverywhere: MailDomainResolver = {
  resolveMx: async () => [{ exchange: "mail.contoh.co.id", priority: 10 }],
  resolve4: async () => ["192.0.2.25"],
  resolve6: async () => ["2001:db8::25"],
};
