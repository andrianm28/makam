/**
 * EmailSender port: every email of v1 goes through it (ADR 0002 amendment
 * 2026-09-25, later; spec Adapter ports > EmailSender). The live adapter
 * sends through the SumoPod SMTP relay (smtp.sumopod.com:465, implicit TLS)
 * from makam.co.id: the email Kode Masuk and Verifikasi email codes (sent by
 * Identity & Access directly), Tagihan / Bukti copies and the document-message
 * fallback, and Undangan Staf (sent by Notifications).
 *
 * One `send` is one attempt: adapters never retry. Notifications owns retries;
 * the email Kode Masuk is sent once and shows "gagal kirim" on failure.
 */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSender {
  /** Resolves with the message's id once the relay accepted it; throws EmailSendError otherwise. */
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

/**
 * Why a send failed:
 * - `rejected`: the relay answered and refused (recipient, sender or message refused, or login refused), or the
 *   adapter itself refused an address that cannot receive mail before connecting (a reserved name, no mail host in DNS);
 * - `unavailable`: no usable connection (DNS, connect, TLS, certificate, timeout, dropped connection).
 */
export type EmailSendFailure = "rejected" | "unavailable";

/**
 * A send that did not go out, as callers see it: Identity & Access shows
 * "gagal kirim", Notifications records gagal and applies its retry rules.
 *
 * It carries only the failure kind, the SMTP reply code and the client's error
 * code: never an address, a code, a body, a relay reply text or a credential,
 * so it is safe to log and to report to GlitchTip.
 */
export class EmailSendError extends Error {
  readonly kind: EmailSendFailure;
  /** The relay's SMTP reply code (e.g. 550), when it answered. */
  readonly responseCode?: number;
  /** The SMTP client's error code (e.g. EENVELOPE, ETIMEDOUT), when known. */
  readonly code?: string;

  constructor(kind: EmailSendFailure, detail: { responseCode?: number; code?: string } = {}) {
    const parts = [detail.code, detail.responseCode].filter((part) => part !== undefined).join(" ");
    super(`Email tidak terkirim (${kind}${parts ? `: ${parts}` : ""})`);
    this.name = "EmailSendError";
    this.kind = kind;
    this.responseCode = detail.responseCode;
    this.code = detail.code;
  }
}
