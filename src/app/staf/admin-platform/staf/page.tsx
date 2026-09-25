import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { staffRoleLabels, staffRoles } from "@/domain/identity";
import { formatWib } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { DeactivateForm, InviteForm } from "./staff-forms";

/** Admin Platform: send Undangan Staf, see open invites, deactivate Akun Staf. */
export default async function StafAdminPage() {
  const actor = await staffMenuActor("admin_platform");
  const { identity } = serverRuntime();
  const [accounts, invites] = await Promise.all([identity.staffAccounts(), identity.openStaffInvites()]);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Staf</h1>

      <Card>
        <CardHeader>
          <CardTitle>Undang staf</CardTitle>
          <CardDescription>
            Undangan dikirim lewat WhatsApp dan berlaku 7 hari. Email wajib untuk setiap staf (cadangan kode masuk lewat
            email). Peran didapat saat ia masuk dengan kode WhatsApp di nomor itu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm roles={staffRoles.map((role) => ({ value: role, label: staffRoleLabels[role] }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Undangan terbuka</CardTitle>
        </CardHeader>
        <CardContent data-testid="undangan-terbuka">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada undangan terbuka.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {invites.map((invite) => (
                <li key={invite.id}>
                  {invite.phoneNumber} · {invite.email} · {staffRoleLabels[invite.role]} · berlaku sampai{" "}
                  {formatWib(invite.expiresAt)} WIB
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Akun Staf</CardTitle>
          <CardDescription>Menonaktifkan Akun Staf mengakhiri sesinya dan menutup aksesnya; riwayatnya tetap.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor WhatsApp</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.accountId}>
                  <TableCell>{account.phoneNumber}</TableCell>
                  <TableCell>{account.email ?? "–"}</TableCell>
                  <TableCell>{account.roles.map((role) => staffRoleLabels[role]).join(", ")}</TableCell>
                  <TableCell>
                    {account.deactivated ? (
                      <Badge variant="secondary">Dinonaktifkan</Badge>
                    ) : account.accountId === actor.accountId ? (
                      <Badge variant="outline">Anda</Badge>
                    ) : (
                      <DeactivateForm accountId={account.accountId} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
