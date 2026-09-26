import { expect, type APIRequestContext } from "@playwright/test";

export interface OutboxEmail {
  subject: string;
  text: string;
  code?: string;
}

/** Every email the in-memory EmailSender "sent" to `to`, oldest first (development stack only). */
export async function emailsTo(request: APIRequestContext, to: string): Promise<OutboxEmail[]> {
  const response = await request.get(`/api/dev/email-outbox?to=${encodeURIComponent(to)}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { messages: OutboxEmail[] }).messages;
}

/** The code in the newest email to `to` whose subject contains `subject`. */
export async function lastEmailCode(request: APIRequestContext, to: string, subject: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    code = (await emailsTo(request, to)).filter((message) => message.subject.includes(subject)).at(-1)?.code;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}
