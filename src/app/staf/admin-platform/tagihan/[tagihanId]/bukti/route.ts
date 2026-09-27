import { z } from "zod";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";

/**
 * Opens the proof a payment outside the PaymentProvider carries (a transfer
 * slip, a cash receipt): for Admin Platform only, a redirect to a 5-minute signed
 * FileStore URL. The file itself never passes through here, and the signed URL
 * is never stored in a page.
 */
export async function GET(_request: Request, context: RouteContext<"/staf/admin-platform/tagihan/[tagihanId]/bukti">) {
  const parsed = z.uuid().safeParse((await context.params).tagihanId);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  if (!actor) return new Response("Belum masuk", { status: 401 });

  const bukti = await serverRuntime().billing.urlBukti(actor, parsed.data);
  if (bukti.ok) {
    return new Response(null, { status: 303, headers: { Location: bukti.url, "Cache-Control": "no-store" } });
  }
  switch (bukti.reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return new Response("Tidak berwenang", { status: 403 });
    case "tanpa_lampiran":
      return new Response("Pembayaran ini tidak punya berkas bukti", { status: 404 });
    case "tagihan_tidak_ditemukan":
      return new Response("Not found", { status: 404 });
  }
}
