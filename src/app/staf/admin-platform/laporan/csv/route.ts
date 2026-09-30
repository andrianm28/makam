import { laporanKeCsv } from "@/domain/queues";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

/**
 * The monthly Laporan as a CSV download (ticket 33), for Admin Platform only:
 * the very read the Laporan page shows, rendered by `laporanKeCsv`, so the file
 * matches the screen. `?bulan=YYYY-MM`.
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response("Belum masuk", { status: 401 });

  const bulan = new URL(request.url).searchParams.get("bulan") ?? "";
  const hasil = await serverRuntime().queues.laporanBulanan(actor, bulan);
  if (!hasil.ok) {
    if (hasil.reason === "input_tidak_valid") return new Response("Bulan tidak valid", { status: 400 });
    return new Response("Tidak berwenang", { status: 403 });
  }
  return new Response(laporanKeCsv(hasil.laporan), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-${hasil.laporan.bulan}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
