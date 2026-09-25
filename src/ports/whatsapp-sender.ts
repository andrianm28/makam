/**
 * WhatsAppSender port (kirim.dev in front of the Meta Cloud API).
 *
 * - Sends an approved template with parameters, including Meta's
 *   authentication template with a copy-code button (`copyCode`).
 * - Reports delivery status: terkirim / dibaca / gagal.
 * - Sends the free-text auto-reply to an inbound message, pointing to the CS
 *   number (inside the 24 h customer-service window, so no template needed).
 */
export type WhatsAppStatus = "terkirim" | "dibaca" | "gagal";

export interface WhatsAppTemplateMessage {
  /** E.164, e.g. +6281234567890. */
  to: string;
  template: string;
  language: string;
  parameters: string[];
  /** For authentication templates: the code behind the copy-code button. */
  copyCode?: string;
}

export interface WhatsAppTextReply {
  to: string;
  text: string;
}

export interface WhatsAppSender {
  sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }>;
  statusOf(messageId: string): Promise<WhatsAppStatus | null>;
  replyText(reply: WhatsAppTextReply): Promise<{ messageId: string }>;
}
