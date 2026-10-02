import { NextResponse } from "next/server";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

/** A short-lived link to one of the signed-in Wakif's own documents, or the final scan. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; berkasId: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.redirect(new URL("/masuk", request.url));
  const { id, berkasId } = await params;
  const hasil = await serverRuntime().wakaf.berkasUrl({ accountId: actor.accountId, email: actor.email }, id, berkasId);
  if (!hasil.ok) return new NextResponse("Tidak ditemukan", { status: 404 });
  return NextResponse.redirect(hasil.url);
}
