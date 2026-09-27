import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { staffRoleLabels } from "@/lib/staff-role-labels";
import { formatWib } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { DeactivateForm, InviteForm } from "./staff-forms";
import { roleUndangan, roleUndanganAwal } from "./undangan-peran";

/** Admin Platform: send Undangan Staf, see open invites, deactivate Akun Staf. */
export default async function StafAdminPage() {
  const actor = await staffMenuActor("admin_platform");
  const { identity } = serverRuntime();
  const [accounts, invites] = await Promise.all([identity.staffAccounts(), identity.openStaffInvites()]);
  const roles = roleUndangan();

  return (
    <>
      <PageHeader title="Staf" description="Undangan Staf, undangan terbuka dan Akun Staf." />

      <FormSection
        title="Undang staf"
        description="Undangan dikirim ke email staf dan berlaku 7 hari. Peran didapat saat ia masuk dengan Kode Masuk ke email itu; akunnya dibuat saat itu bila belum ada. Nomor telepon dicatat sebagai kontak. Admin Lokasi diundang dari halaman Lokasi Mitra-nya."
      >
        <InviteForm roles={roles} defaultRole={roleUndanganAwal(roles)} />
      </FormSection>

      <FormSection title="Undangan terbuka">
        <div data-testid="undangan-terbuka">
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada undangan terbuka.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {invites.map((invite) => (
                <li key={invite.id}>
                  {invite.email} · {invite.phoneNumber} · {staffRoleLabels[invite.role]} · berlaku sampai{" "}
                  {formatWib(invite.expiresAt)} WIB
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Akun Staf"
        description="Menonaktifkan Akun Staf mencabut semua perannya dan mengakhiri sesinya. Akunnya tetap bisa masuk sebagai Pemesan, dan riwayatnya tetap. Untuk memberi peran lagi, kirim Undangan Staf baru ke Email Terverifikasi-nya. Akun yang belum punya Email Terverifikasi belum bisa masuk sampai dipulihkan lewat Pemulihan Akun."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nomor telepon</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.accountId}>
                <TableCell>
                  {account.email ?? "–"}
                  {account.emailTerverifikasi ? null : (
                    <Link
                      href={`/staf/admin-platform/pemulihan-akun?akun=${encodeURIComponent(account.accountId)}`}
                      className="ml-2 text-brand underline underline-offset-4"
                    >
                      Perlu Pemulihan Akun
                    </Link>
                  )}
                </TableCell>
                <TableCell>{account.phoneNumber ?? "–"}</TableCell>
                <TableCell>{account.roles.map((role) => staffRoleLabels[role]).join(", ") || "–"}</TableCell>
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
      </FormSection>
    </>
  );
}
