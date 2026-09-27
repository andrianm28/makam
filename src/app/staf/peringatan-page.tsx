import { BellIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { MarkPeringatanRead } from "./mark-read-on-view";

/**
 * A field role's Peringatan Staf: every one of the signed-in Akun's alerts
 * (the header bell shows only the latest few), newest first, each linking to
 * its subject. Being shown marks them all read, same as opening the bell.
 */
export async function PeringatanPage({ role }: { role: "petugas_lapangan" | "mitra_jasa" }) {
  const actor = await staffMenuActor(role);
  const { notifications } = serverRuntime();
  const result = await notifications.staffAlerts(actor, { limit: 50 });
  const unread = result.ok ? result.unread : 0;
  const alerts = result.ok ? result.latest : [];

  return (
    <>
      <PageHeader title="Peringatan Staf" description="Pesan tentang pekerjaan yang perlu Anda tangani." />
      <MarkPeringatanRead unread={unread} />
      {alerts.length === 0 ? (
        <EmptyState
          icon={BellIcon}
          title="Belum ada Peringatan Staf"
          description="Peringatan tentang pekerjaan yang ditugaskan ke Anda akan muncul di sini."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <Link key={alert.id} href={alert.url}>
              <Card size="sm">
                <CardContent className="flex flex-col gap-0.5">
                  <span className={cn("text-body", !alert.read && "font-semibold")}>{alert.title}</span>
                  <span className="text-small text-muted-foreground">{alert.body}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
