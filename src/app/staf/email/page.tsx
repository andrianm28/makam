import { redirect } from "next/navigation";
import { EmailSection } from "@/app/akun/email-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { akunResource, authorize } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { heldStaffRoles } from "@/server/staff-area";

/**
 * Verifikasi Email in the staff area, for every staff role (an Admin Platform
 * passes TOTP first). Each change is a staff write with an Entri Audit.
 */
export default async function StafEmailPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "akun.email", akunResource(actor.accountId));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/staf");
  if (heldStaffRoles(actor.roles).length === 0) redirect("/akun");
  const email = await serverRuntime().identity.accountEmail(actor);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Email</h1>
      <Card>
        <CardHeader>
          <CardTitle>Email akun staf</CardTitle>
          <CardDescription>
            Email dari Undangan Staf belum terverifikasi. Verifikasi di sini untuk bisa masuk dengan email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSection email={email.email} verified={email.verified} canRemove={false} />
        </CardContent>
      </Card>
    </>
  );
}
