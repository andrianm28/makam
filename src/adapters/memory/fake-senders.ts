import { randomUUID } from "node:crypto";
import { EmailSendError, type EmailMessage, type EmailSender } from "@/ports/email-sender";
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

/** Records every email it accepted; tests can make the relay refuse the next sends. */
export class FakeEmailSender implements EmailSender {
  readonly sent: (EmailMessage & { messageId: string })[] = [];
  #refuseNext = 0;

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    if (this.#refuseNext > 0) {
      this.#refuseNext -= 1;
      throw new EmailSendError("rejected", { code: "EENVELOPE", responseCode: 550 });
    }
    const messageId = `<${randomUUID()}@fake.makam.co.id>`;
    this.sent.push({ ...message, messageId });
    return { messageId };
  }

  /** The next `count` sends are refused, as the relay refusing at send time; nothing is recorded. */
  failNextSend(count = 1): void {
    this.#refuseNext += count;
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
