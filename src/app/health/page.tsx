import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWib } from "@/lib/time/jakarta";
import { readHealth } from "@/server/health";

export const metadata: Metadata = {
  title: "Health | Makam.co.id",
  robots: { index: false, follow: false },
};

function Status({ ok, testId }: { ok: boolean; testId: string }) {
  return (
    <Badge data-testid={testId} variant={ok ? "default" : "destructive"}>
      {ok ? "OK" : "FAIL"}
    </Badge>
  );
}

export default async function HealthPage() {
  await connection(); // always rendered per request, never prerendered
  const health = await readHealth();
  const heartbeat = health.worker;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription>Checked {formatWib(health.checkedAt)}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-4 text-sm">
            <dt>
              <div className="font-medium">Database</div>
              {health.database.error ? (
                <div className="text-muted-foreground">{health.database.error}</div>
              ) : null}
            </dt>
            <dd>
              <Status ok={health.database.ok} testId="database-status" />
            </dd>

            <dt>
              <div className="font-medium">Worker heartbeat</div>
              <div className="text-muted-foreground" data-testid="worker-heartbeat">
                {heartbeat?.lastBeatAt
                  ? `${formatWib(heartbeat.lastBeatAt)} (${heartbeat.ageSeconds} s ago)`
                  : "no heartbeat yet"}
              </div>
            </dt>
            <dd>
              <Status ok={Boolean(heartbeat?.isFresh)} testId="worker-status" />
            </dd>
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
