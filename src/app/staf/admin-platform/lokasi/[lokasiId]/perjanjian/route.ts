import { z } from "zod";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";

const paramsSchema = z.object({ lokasiId: z.uuid() });

/**
 * Opens a Lokasi Mitra's agreement scan: for Admin Platform only (not the
 * Lokasi's Admin Lokasi), a redirect to a 5-minute signed FileStore URL. The
 * file itself never passes through here, and the signed URL is never stored in a page.
 */
export async function GET(_request: Request, context: RouteContext<"/staf/admin-platform/lokasi/[lokasiId]/perjanjian">) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  if (!actor) return new Response("Belum masuk", { status: 401 });

  const scan = await serverRuntime().lokasi.agreementScanUrl(actor, parsed.data.lokasiId);
  if (scan.ok) {
    return new Response(null, { status: 303, headers: { Location: scan.url, "Cache-Control": "no-store" } });
  }
  switch (scan.reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return new Response("Tidak berwenang", { status: 403 });
    case "tidak_ditemukan":
    case "belum_ada_berkas":
      return new Response("Not found", { status: 404 });
  }
}
