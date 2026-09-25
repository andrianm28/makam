import { expect, type APIRequestContext } from "@playwright/test";

/** The code in the newest email the in-memory EmailSender "sent" to `to` whose subject contains `subject` (development stack only). */
export async function lastEmailCode(request: APIRequestContext, to: string, subject: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    const response = await request.get(`/api/dev/email-outbox?to=${encodeURIComponent(to)}`);
    expect(response.ok()).toBe(true);
    const { messages } = (await response.json()) as { messages: { subject: string; code?: string }[] };
    code = messages.filter((message) => message.subject.includes(subject)).at(-1)?.code;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}
