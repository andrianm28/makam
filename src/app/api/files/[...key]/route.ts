import { z } from "zod";
import { DiskFileStore } from "@/adapters/live/disk-file-store";
import { isSafeFileKey } from "@/ports/file-store";
import { serverRuntime } from "@/server/runtime";

const paramsSchema = z.object({
  key: z
    .array(z.string())
    .min(1)
    .refine((segments) => isSafeFileKey(segments.join("/")), "unsafe key"),
});

const querySchema = z.object({
  exp: z.coerce.number().int().positive(),
  sig: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/),
});

/**
 * Serves a FileStore signed URL (`DiskFileStore.signedUrl`): the private
 * volume is never mounted under nginx or Next's static handler, only reached
 * through this route. The signature is the caller's whole authorization here
 * — re-derived and checked by `readSigned`, exactly as `/dokumen/[link]/pdf`
 * trusts a Tagihan's unguessable link — because whoever asked the domain
 * module for the signed URL (e.g. `lokasi.agreementScanUrl`) already checked
 * the caller's role. A bad key, a wrong or expired signature, or the fake
 * FileStore of development and test (never served over HTTP) all give the
 * same 404: nothing here distinguishes "wrong" from "gone".
 */
export async function GET(request: Request, context: RouteContext<"/api/files/[...key]">) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return notFound();
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return notFound();

  const { files } = serverRuntime().adapters;
  if (!(files instanceof DiskFileStore)) return notFound();

  const file = await files.readSigned(params.data.key.join("/"), query.data.exp, query.data.sig);
  if (!file) return notFound();

  return new Response(Buffer.from(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
