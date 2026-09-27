import { redirect } from "next/navigation";
import { EmailSection, PhoneSection } from "@/app/(site)/akun/email-section";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { akunResource, authorize } from "@/domain/identity";
import { currentActor } from "@/server/session";
import { heldStaffRoles } from "@/server/staff-area";

/**
 * The Akun Staf's Email Terverifikasi (Verifikasi email) and phone number in
 * the staff area, for every staff role (an Admin Platform passes TOTP first).
 * Each change is a staff write with an Entri Audit.
 */
export default async function StafEmailPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "akun.email", akunResource(actor.accountId));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/staf");
  if (heldStaffRoles(actor.roles).length === 0) redirect("/akun");

  return (
    <>
      <PageHeader title="Email" description="Email Terverifikasi dan nomor telepon akun staf ini, terpisah dari akun keluarga." />
      <Card>
        <CardHeader>
          <CardTitle>Email akun staf</CardTitle>
          <CardDescription>Kode Masuk dan Peringatan Staf dikirim ke Email Terverifikasi ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSection email={actor.email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nomor telepon</CardTitle>
          <CardDescription>Kontak untuk rekan kerja dan Kontak Siaga. Nomor ini tidak dipakai untuk masuk.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneSection phoneNumber={actor.phoneNumber} />
        </CardContent>
      </Card>
    </>
  );
}
