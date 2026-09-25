import { randomUUID } from "node:crypto";
import { createTransport, type Transporter } from "nodemailer";
import type { SmtpSettings } from "@/lib/env";
import { EmailSendError, type EmailMessage, type EmailSender } from "@/ports/email-sender";

/** Connection, greeting and DNS each give up after this long (ticket 68: at most 15 s). */
const CONNECT_TIMEOUT_MS = 15_000;
/** Idle limit once connected (e.g. while a PDF is uploading). */
const SOCKET_TIMEOUT_MS = 30_000;

export interface SmtpEmailSenderOptions {
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

  constructor(settings: SmtpSettings, options: SmtpEmailSenderOptions = {}) {
    this.#from = settings.from;
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

  async send(message: EmailMessage): Promise<{ messageId: string }> {
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
