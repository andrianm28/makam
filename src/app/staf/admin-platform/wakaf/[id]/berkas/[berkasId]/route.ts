import { NextResponse } from "next/server";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

/** A short-lived link to one document of a Pengajuan; the module refuses anyone but Admin Platform. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; berkasId: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.redirect(new URL("/masuk", request.url));
  const { id, berkasId } = await params;
  const hasil = await serverRuntime().wakaf.berkasUrlStaf(actor, id, berkasId);
  if (!hasil.ok) return new NextResponse("Tidak ditemukan", { status: hasil.reason === "tidak_berwenang" || hasil.reason === "perlu_totp" ? 403 : 404 });
  return NextResponse.redirect(hasil.url);
}
