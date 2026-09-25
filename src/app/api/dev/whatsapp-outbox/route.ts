import { connection } from "next/server";
import { z } from "zod";
import { FakeWhatsAppSender } from "@/adapters/memory";
import { usesInMemoryFakes } from "@/lib/env";
import { serverRuntime } from "@/server/runtime";

const querySchema = z.object({ to: z.string().regex(/^\+\d{8,15}$/) });

/**
 * Development and test only: the WhatsApp templates the in-memory fake
 * "sent" to one number, so Playwright (and a developer) can read a login OTP.
 * Answers 404 wherever the live WhatsAppSender is wired (staging, production).
 */
export async function GET(request: Request) {
  await connection();
  const { env, adapters } = serverRuntime();
  if (!usesInMemoryFakes(env.APP_ENV) || !(adapters.whatsapp instanceof FakeWhatsAppSender)) {
    return new Response("Not found", { status: 404 });
  }

  const parsed = querySchema.safeParse({ to: new URL(request.url).searchParams.get("to") });
  if (!parsed.success) return Response.json({ error: "to must be an E.164 number" }, { status: 400 });

  const messages = adapters.whatsapp.sent
    .filter((message) => message.to === parsed.data.to)
    .map(({ template, parameters, copyCode, messageId }) => ({ template, parameters, copyCode, messageId }));
  return Response.json({ messages });
}
