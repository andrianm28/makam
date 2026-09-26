import { z } from "zod";
import { serverRuntime } from "@/server/runtime";

/** Far larger than any payment event; anything bigger is refused unread. */
const MAX_BODY_BYTES = 64 * 1024;

/** The Svix headers the signature is checked with (the PaymentProvider verifies them). */
const svixHeaders = z.object({
  "svix-id": z.string().min(1).max(200),
  "svix-timestamp": z.string().regex(/^\d{1,12}$/),
  "svix-signature": z.string().min(1).max(2000),
});

/**
 * The PaymentProvider's webhook (SumoPod in v1). Thin: the Svix signature is
 * the caller's authentication, checked by the provider port inside Billing
 * with the payload's Zod validation; Billing processes each event exactly
 * once. A refused signature answers 401; everything else Billing accepted
 * (including a replay, or money it reported for review) answers 200, so the
 * provider stops redelivering. An error answers 500 and the provider retries.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return plain("Terlalu besar", 413);
  // The declared length may be absent (chunked) or wrong: the limit holds while reading.
  const rawBody = await bodyWithin(request, MAX_BODY_BYTES);
  if (rawBody === null) return plain("Terlalu besar", 413);

  const headers = svixHeaders.safeParse(Object.fromEntries(request.headers));
  if (!headers.success) return plain("Tanda tangan tidak valid", 401);

  const received = await serverRuntime().billing.receivePaymentWebhook({ rawBody, headers: headers.data });
  if (!received.ok) return plain("Tanda tangan tidak valid", 401);
  return Response.json({ diterima: true, hasil: received.outcome }, { headers: { "Cache-Control": "no-store" } });
}

/** The body as text, or null (reading stopped, the rest never read) once it passes `limit` bytes. */
async function bodyWithin(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store" } });
}
