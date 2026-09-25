/**
 * EmailSender port (Amazon SES, Jakarta): sends document copies and is the
 * email fallback for notifications.
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
  send(message: EmailMessage): Promise<{ messageId: string }>;
}
