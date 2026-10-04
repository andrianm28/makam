import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";

/**
 * What the address check asks of DNS: the three kinds of record that decide
 * whether a domain can receive mail. Node's `dns.promises.Resolver` has exactly
 * these methods, so the live one is a `Resolver`; tests give a table instead.
 */
export interface MailDomainResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

/**
 * The last parts of a domain that RFC 2606 and RFC 6761 keep for documentation
 * and tests. No mailbox can exist under them, and a relay still accepts such an
 * address and bounces it later, which is why the sender refuses it first.
 */
const RESERVED_LAST_PARTS = new Set(["invalid", "test", "example", "localhost"]);

/**
 * The domain of an address as DNS knows it: lower case, in ASCII (punycode) and
 * without a root dot; undefined when there is none or it is no host name (an IP
 * literal, say), which the check leaves to the relay.
 */
function mailDomain(address: string): string | undefined {
  const at = address.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = domainToASCII(address.slice(at + 1).trim().replace(/>$/, "").replace(/\.$/, ""));
  return domain === "" ? undefined : domain;
}

/** The system's DNS, for the live sender: each query gives up after 2 s and is tried twice. */
export function systemMailDomainResolver(): MailDomainResolver {
  return new Resolver({ timeout: 2_000, tries: 2 });
}

/** The c-ares codes for "no such domain" and "this name has no record of that type": the only DNS failures that are an answer. */
const FINAL_ANSWERS = new Set(["ENOTFOUND", "ENODATA"]);

/** The records of one lookup; none when DNS said there are none; "unknown" when it failed some other way (SERVFAIL, a timeout...). */
async function recordsOf<T>(lookup: () => Promise<T[]>): Promise<T[] | "unknown"> {
  try {
    return await lookup();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" && FINAL_ANSWERS.has(code) ? [] : "unknown";
  }
}

const found = (records: unknown[] | "unknown") => records !== "unknown" && records.length > 0;

/** A null MX (RFC 7505): the domain says it takes no mail. Node reports its empty exchange as "". */
const isNullMx = (mx: { exchange: string }) => mx.exchange === "" || mx.exchange === ".";

/** Whether DNS gives `domain` a place to deliver mail: "yes", "no" (every lookup said so), or "unknown" (some failed). */
async function mailHostOf(domain: string, resolver: MailDomainResolver): Promise<"yes" | "no" | "unknown"> {
  const mx = await recordsOf(() => resolver.resolveMx(domain));
  if (mx !== "unknown" && mx.length > 0) return mx.every(isNullMx) ? "no" : "yes";
  // No MX: the domain's own address takes its mail (RFC 5321, section 5.1).
  const [a, aaaa] = await Promise.all([
    recordsOf(() => resolver.resolve4(domain)),
    recordsOf(() => resolver.resolve6(domain)),
  ]);
  if (found(a) || found(aaaa)) return "yes";
  return mx !== "unknown" && a !== "unknown" && aaaa !== "unknown" ? "no" : "unknown";
}

/** `work`'s result, or `fallback` once `ms` have passed (the work is not cancelled, it just stops mattering). */
async function within<T, F>(ms: number, work: Promise<T>, fallback: F): Promise<T | F> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True only when `address` certainly cannot receive mail: its domain ends in a
 * reserved name, or DNS gives it no mail host (no MX and no A or AAAA record,
 * or a null MX). When DNS cannot say (SERVFAIL, a timeout, no answer within
 * `timeoutMs`) the answer is false, so the send goes ahead and the relay
 * decides.
 */
export async function cannotReceiveMail(
  address: string,
  resolver: MailDomainResolver,
  timeoutMs: number,
): Promise<boolean> {
  const domain = mailDomain(address);
  if (domain === undefined) return false;
  if (RESERVED_LAST_PARTS.has(domain.slice(domain.lastIndexOf(".") + 1))) return true;
  return (await within(timeoutMs, mailHostOf(domain, resolver), "unknown")) === "no";
}
