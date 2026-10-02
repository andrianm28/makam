import { authorize, pemesananResource } from "@/domain/identity";
import { nomorPengurusanSchema } from "@/domain/pengurusan";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

const paramsSchema = nomorPengurusanSchema;

/**
 * "Unduh PDF" of the Surat Kuasa: the Pemesan's own order only. The module renders and stores the PDF
 * in the private FileStore; this answers with a redirect to its 5-minute signed URL.
 */
export async function GET(_request: Request, context: RouteContext<"/pengurusan/[nomor]/surat-kuasa/pdf">) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return notFound();
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 302, headers: { Location: "/masuk", "Cache-Control": "no-store" } });
  if (!authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed) return notFound();
  const url = await serverRuntime().pengurusan.suratKuasaPdfUrl({ accountId: actor.accountId }, parsed.data.nomor);
  if (!url) return notFound();
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

function notFound() {
  return new Response("Surat Kuasa tidak ditemukan", { status: 404, headers: { "Cache-Control": "no-store" } });
}
