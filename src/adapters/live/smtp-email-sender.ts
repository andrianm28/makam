import { randomUUID } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { createTransport, type Transporter } from "nodemailer";
import type { SmtpSettings } from "@/lib/env";
import { EmailSendError, type EmailMessage, type EmailSender } from "@/ports/email-sender";

/** Connection, greeting and DNS each give up after this long (ticket 68: at most 15 s). */
const CONNECT_TIMEOUT_MS = 15_000;
/** Idle limit once connected (e.g. while a PDF is uploading). */
const SOCKET_TIMEOUT_MS = 30_000;

/** A DNS lookup gives up after this long, and the send then goes ahead (fail open). */
const DNS_TIMEOUT_MS = 5_000;
const RESERVED_TLDS = new Set(["invalid", "test", "example", "localhost"]);
const NO_SUCH_NAME = new Set(["ENOTFOUND", "ENODATA"]);

/** The two DNS questions the recipient check asks. */
export interface RecipientResolver {
  resolveMx(domain: string): Promise<{ exchange: string }[]>;
  /** A and AAAA records together. */
  resolveAddresses(domain: string): Promise<string[]>;
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("dns timeout"), { code: "ETIMEOUT" })), DNS_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function systemResolver(): RecipientResolver {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
  const settled = async (lookup: Promise<string[]>) =>
    lookup.catch((error: unknown) => {
      if (NO_SUCH_NAME.has((error as { code?: string })?.code ?? "")) return [] as string[];
      throw error;
    });
  return {
    resolveMx: (domain) => withTimeout(resolver.resolveMx(domain)),
    resolveAddresses: (domain) =>
      withTimeout(
        Promise.all([settled(resolver.resolve4(domain)), settled(resolver.resolve6(domain))]).then(([a, b]) => [...a, ...b]),
      ),
  };
}

function domainOf(to: string): string | undefined {
  const at = to.lastIndexOf("@");
  if (at < 0) return undefined;
  const domain = to.slice(at + 1).replace(/[>\s"]+$/g, "").trim().toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(domain) && domain.includes(".") ? domain : undefined;
}

export interface SmtpEmailSenderOptions {
  /** DNS lookups for the recipient check; tests inject a fake. Defaults to the system resolver with a 5 s limit. */
  resolver?: RecipientResolver;
  /**
   * An extra certificate (PEM) to trust, for tests against a local relay with
   * a self-signed certificate. Verification stays on either way. Never set in
   * staging or production, where the relay's public certificate is verified
   * against the system roots.
   */
  trustedCertificate?: string;
}

/**
 * The live EmailSender: the SumoPod SMTP relay (smtp.sumopod.com:465), implicit
 * TLS with the certificate verified, never plaintext, one connection per send
 * and no retries (Notifications owns retries; the email Kode Masuk is sent once).
 *
 * Nothing is logged, and a failure is an EmailSendError that carries only its
 * kind and codes: no address, code, body, relay reply text or credential.
 */
export class SmtpEmailSender implements EmailSender {
  readonly #transport: Transporter;
  readonly #from: SmtpSettings["from"];
  readonly #messageIdDomain: string;
  readonly #resolver: RecipientResolver;

  constructor(settings: SmtpSettings, options: SmtpEmailSenderOptions = {}) {
    this.#from = settings.from;
    this.#resolver = options.resolver ?? systemResolver();
    this.#messageIdDomain = settings.from.address.split("@").pop()!.toLowerCase();
    this.#transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: true, // implicit TLS from the first byte; there is no STARTTLS or plaintext path
      auth: { user: settings.user, pass: settings.password },
      tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        ...(options.trustedCertificate ? { ca: [options.trustedCertificate] } : {}),
      },
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      dnsTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      logger: false,
      debug: false,
      // Attachments are always bytes we pass in; never let a path or URL be read.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async #deliverable(to: string): Promise<boolean> {
    const domain = typeof to === "string" ? domainOf(to) : undefined;
    if (domain === undefined) return true;
    if (RESERVED_TLDS.has(domain.split(".").pop()!)) return false;
    return !(await lookupSaysNothing(this.#resolver, domain));
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    if (!(await this.#deliverable(message.to))) throw new EmailSendError("rejected", { code: "ENORECIPIENT" });
    const messageId = `<${randomUUID()}@${this.#messageIdDomain}>`;
    try {
      await this.#transport.sendMail({
        from: { name: this.#from.name, address: this.#from.address },
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
        attachments: (message.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          content: Buffer.from(attachment.content),
        })),
        messageId,
        date: new Date(),
      });
    } catch (error) {
      throw toEmailSendError(error);
    }
    return { messageId };
  }
}

/** Only a definitive "no such domain" refuses; any other lookup failure lets the send go ahead. */
async function lookupSaysNothing(resolver: RecipientResolver, domain: string): Promise<boolean> {
  try {
    if ((await resolver.resolveMx(domain)).length > 0) return false;
  } catch (error) {
    if (!NO_SUCH_NAME.has((error as { code?: string })?.code ?? "")) return false;
  }
  try {
    return (await resolver.resolveAddresses(domain)).length === 0;
  } catch (error) {
    return NO_SUCH_NAME.has((error as { code?: string })?.code ?? "");
  }
}

/** Keeps only the SMTP reply code and the client's error code; drops the message, reply text and cause. */
function toEmailSendError(error: unknown): EmailSendError {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const safeCode = typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : undefined;
  const safeResponseCode =
    typeof responseCode === "number" && Number.isInteger(responseCode) && responseCode >= 400 && responseCode < 600
      ? responseCode
      : undefined;
  const refusedByRelay = safeResponseCode !== undefined || safeCode === "EAUTH" || safeCode === "EENVELOPE";
  return new EmailSendError(refusedByRelay ? "rejected" : "unavailable", {
    code: safeCode,
    responseCode: safeResponseCode,
  });
}
