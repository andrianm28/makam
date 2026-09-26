import { randomUUID } from "node:crypto";
import { EmailSendError, type EmailMessage, type EmailSender } from "@/ports/email-sender";
import type { PushNotification, PushResult, PushSubscription, WebPush } from "@/ports/web-push";

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
