import { connection } from "next/server";
import { z } from "zod";
import { usesInMemoryFakes } from "@/lib/env";
import type { EmailMessage, EmailSender } from "@/ports/email-sender";
import { serverRuntime } from "@/server/runtime";

const querySchema = z.object({ to: z.email().transform((email) => email.toLowerCase()) });

/**
 * Development and test only: the emails the in-memory fake EmailSender "sent"
 * to one address (the email Kode Masuk, the Verifikasi Email code), so
 * Playwright (and a developer) can read a code. Answers 404 wherever the live
 * EmailSender is wired (staging, production).
 */
export async function GET(request: Request) {
  await connection();
  const { env, adapters } = serverRuntime();
  if (!usesInMemoryFakes(env.APP_ENV) || !isRecordingFake(adapters.email)) {
    return new Response("Not found", { status: 404 });
  }

  const parsed = querySchema.safeParse({ to: new URL(request.url).searchParams.get("to") });
  if (!parsed.success) return Response.json({ error: "to must be an email address" }, { status: 400 });

  const messages = adapters.email.sent
    .filter((message) => message.to === parsed.data.to)
    .map(({ subject, text, messageId }) => ({ subject, text, code: text.match(/\b(\d{6})\b/)?.[1], messageId }));
  return Response.json({ messages });
}

/**
 * The in-memory FakeEmailSender, recognised by its record of sends (not
 * `instanceof`: the route and the Server Actions may load separate copies of
 * the class, while the runtime they share is a single one on globalThis).
 */
function isRecordingFake(sender: EmailSender): sender is EmailSender & { sent: (EmailMessage & { messageId: string })[] } {
  return "sent" in sender && Array.isArray(sender.sent);
}
