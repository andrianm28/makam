/**
 * The fake PaymentProvider's fixed Svix secret. Never used outside fakes. Its
 * own module, free of imports, so Playwright can sign webhooks with it too.
 */
export const FAKE_PAYMENT_WEBHOOK_SECRET = "whsec_" + Buffer.from("makam-fake-payment-webhook-secret").toString("base64");
