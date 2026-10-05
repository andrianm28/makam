import { z } from "zod";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/**
 * Opens the heirship proof of a further burial's consent (ticket 125): a redirect to a 5-minute signed FileStore
 * URL, made when the staff member clicks, so the file itself never passes through here and no signed URL sits in a
 * page. The Pemesanan module refuses anyone who may not read the order (another Lokasi's Admin Lokasi, a family).
 */
export async function GET(_request: Request, context: RouteContext<"/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]/bukti-ahli-waris">) {
  const nomor = nomorSchema.safeParse((await context.params).nomor);
  if (!nomor.success) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  if (!actor) return new Response("Belum masuk", { status: 401 });

  const bukti = await serverRuntime().pemesanan.urlBuktiAhliWaris(actor, nomor.data);
  if (bukti.ok) {
    return new Response(null, { status: 303, headers: { Location: bukti.url, "Cache-Control": "no-store" } });
  }
  switch (bukti.reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return new Response("Tidak berwenang", { status: 403 });
    case "pesanan_tidak_ditemukan":
    case "belum_ada_berkas":
      return new Response("Not found", { status: 404 });
  }
}
