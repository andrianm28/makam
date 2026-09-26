import { z } from "zod";
import { documentLinkSchema } from "@/domain/billing";
import { serverRuntime } from "@/server/runtime";

const paramsSchema = z.object({ link: documentLinkSchema });

/**
 * "Unduh PDF": the Tagihan or Bukti behind an unguessable link, rendered from
 * its own page by the PdfRenderer. Anyone with the link may download it, as
 * anyone with it may open the page; it is never cached on the way.
 */
export async function GET(_request: Request, context: RouteContext<"/dokumen/[link]/pdf">) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return notFound();
  const pdf = await serverRuntime().billing.documentPdf(parsed.data.link);
  if (!pdf) return notFound();
  return new Response(Buffer.from(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function notFound() {
  return new Response("Dokumen tidak ditemukan", { status: 404, headers: { "Cache-Control": "no-store" } });
}
