import { connection } from "next/server";
import { readHealth } from "@/server/health";

/** Machine-readable /health for the uptime alarm: 200 when healthy, 503 otherwise. */
export async function GET() {
  await connection(); // per request, never cached
  const health = await readHealth();
  return Response.json(
    {
      ok: health.ok,
      environment: health.environment,
      checkedAt: health.checkedAt.toISOString(),
      database: { ok: health.database.ok },
      worker: health.worker && {
        lastBeatAt: health.worker.lastBeatAt?.toISOString() ?? null,
        ageSeconds: health.worker.ageSeconds,
        fresh: health.worker.isFresh,
      },
    },
    { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
