import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWib } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { InviteAdminLokasiForm, RemoveAdminLokasiForm } from "../../lokasi-forms";

/** Admin Platform, tab Admin Lokasi: everyone with the role here, open Undangan and inviting more. */
export default async function LokasiMitraAdminLokasiPage({
  params,
}: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/admin-lokasi">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const admins = await serverRuntime().lokasi.adminLokasiOf(actor, lokasiId);
  if (!admins.ok) redirect("/staf/admin-platform/lokasi");

  return (
    <section aria-labelledby="admin-lokasi">
      <Card>
        <CardHeader>
          <CardTitle id="admin-lokasi">Admin Lokasi</CardTitle>
          <CardDescription>
            Semua Admin Lokasi sama kedudukannya. Undangan dikirim ke email dan berlaku 7 hari; peran didapat saat ia masuk
            dengan Kode Masuk ke email itu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {admins.adminLokasi.length > 0 ? (
            <ul className="flex flex-col gap-2 text-body">
              {admins.adminLokasi.map((admin) => (
                <li key={admin.accountId} className="flex flex-wrap items-center gap-3">
                  <span>
                    {admin.email ?? "–"} · {admin.phoneNumber ?? "–"}
                  </span>
                  <RemoveAdminLokasiForm lokasiId={lokasiId} accountId={admin.accountId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted-foreground">Belum ada Admin Lokasi.</p>
          )}
          {admins.openInvites.length > 0 ? (
            <div className="text-body">
              <p className="font-medium">Undangan terbuka</p>
              <ul className="flex flex-col gap-1">
                {admins.openInvites.map((invite) => (
                  <li key={invite.id}>
                    {invite.email} · {invite.phoneNumber} · berlaku sampai {formatWib(invite.expiresAt)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <InviteAdminLokasiForm lokasiId={lokasiId} />
        </CardContent>
      </Card>
    </section>
  );
}
