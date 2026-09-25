import { Webhook } from "svix";
import { InvalidWebhookError, type WebhookRequest } from "@/ports/payment-provider";

/**
 * Svix webhook signing, shared by the fake PaymentProvider (which signs) and
 * the live SumoPod adapter (which verifies).
 *
 * Svix rejects timestamps more than 5 minutes from the real time, so signing
 * always uses the system time, never the domain Clock: the tolerance is about
 * the transport, not about business time.
 */
export function signSvixWebhook(
  secret: string,
  messageId: string,
  rawBody: string,
  signedAt: Date = new Date(),
): WebhookRequest {
  const signature = new Webhook(secret).sign(messageId, signedAt, rawBody);
  return {
    rawBody,
    headers: {
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
      "svix-signature": signature,
    },
  };
}

/** Throws InvalidWebhookError unless the request carries a valid Svix signature. */
export function verifySvixWebhook(secret: string, request: WebhookRequest): void {
  const headers = Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  try {
    new Webhook(secret).verify(request.rawBody, headers);
  } catch (error) {
    throw new InvalidWebhookError(error instanceof Error ? error.message : undefined);
  }
}
