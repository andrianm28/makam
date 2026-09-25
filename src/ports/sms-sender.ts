/** SmsSender port (Zenziva): the OTP fallback only ("Kirim lewat SMS"). */
export interface SmsMessage {
  /** E.164, e.g. +6281234567890. */
  to: string;
  text: string;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<{ messageId: string }>;
}
