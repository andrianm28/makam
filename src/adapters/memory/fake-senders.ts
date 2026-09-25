import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailSender } from "@/ports/email-sender";
import type { SmsMessage, SmsSender } from "@/ports/sms-sender";
import type { PushNotification, PushResult, PushSubscription, WebPush } from "@/ports/web-push";
import type {
  WhatsAppSender,
  WhatsAppStatus,
  WhatsAppTemplateMessage,
  WhatsAppTextReply,
} from "@/ports/whatsapp-sender";

export interface SentWhatsAppTemplate extends WhatsAppTemplateMessage {
  messageId: string;
}

/** Records every WhatsApp template and reply; statuses can be moved by tests. */
export class FakeWhatsAppSender implements WhatsAppSender {
  readonly sent: SentWhatsAppTemplate[] = [];
  readonly replies: WhatsAppTextReply[] = [];
  readonly #status = new Map<string, WhatsAppStatus>();
  #failNext = 0;

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }> {
    const messageId = `wamid.fake.${randomUUID()}`;
    this.sent.push({ ...message, messageId });
    const failed = this.#failNext > 0;
    if (failed) this.#failNext -= 1;
    this.#status.set(messageId, failed ? "gagal" : "terkirim");
    return { messageId };
  }

  async statusOf(messageId: string): Promise<WhatsAppStatus | null> {
    return this.#status.get(messageId) ?? null;
  }

  async replyText(reply: WhatsAppTextReply): Promise<{ messageId: string }> {
    this.replies.push(reply);
    return { messageId: `wamid.fake.${randomUUID()}` };
  }

  /** The next `count` sends are reported as gagal. */
  failNextSend(count = 1): void {
    this.#failNext += count;
  }

  markStatus(messageId: string, status: WhatsAppStatus): void {
    if (!this.#status.has(messageId)) throw new Error(`No WhatsApp message ${messageId}`);
    this.#status.set(messageId, status);
  }
}

export class FakeEmailSender implements EmailSender {
  readonly sent: (EmailMessage & { messageId: string })[] = [];

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `email-${randomUUID()}`;
    this.sent.push({ ...message, messageId });
    return { messageId };
  }
}

export class FakeSmsSender implements SmsSender {
  readonly sent: (SmsMessage & { messageId: string })[] = [];

  async send(message: SmsMessage): Promise<{ messageId: string }> {
    const messageId = `sms-${randomUUID()}`;
    this.sent.push({ ...message, messageId });
    return { messageId };
  }
}

export class FakeWebPush implements WebPush {
  readonly sent: { subscription: PushSubscription; notification: PushNotification }[] = [];
  readonly #gone = new Set<string>();

  async send(push: { subscription: PushSubscription; notification: PushNotification }): Promise<PushResult> {
    if (this.#gone.has(push.subscription.endpoint)) {
      return { delivered: false, subscriptionGone: true };
    }
    this.sent.push(push);
    return { delivered: true, subscriptionGone: false };
  }

  /** Future sends to this endpoint report the subscription as gone. */
  expireSubscription(endpoint: string): void {
    this.#gone.add(endpoint);
  }
}
