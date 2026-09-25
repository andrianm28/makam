import { expect, type APIRequestContext } from "@playwright/test";

/** What the in-memory WhatsAppSender "sent" to a number (development stack only). */
export async function outbox(request: APIRequestContext, to: string) {
  const response = await request.get(`/api/dev/whatsapp-outbox?to=${encodeURIComponent(to)}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { messages: { template: string; copyCode?: string; parameters: string[] }[] })
    .messages;
}

/** The last login OTP the in-memory WhatsAppSender "sent" to a number. */
export async function lastOtp(request: APIRequestContext, to: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    code = (await outbox(request, to)).filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}
