import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentActor } from "@/server/session";
import { TotpForm } from "./totp-form";

/**
 * The TOTP step: an Akun holding Admin Platform enrols an authenticator once,
 * then passes TOTP after every OTP login, before anything else in the app.
 */
export default async function TotpPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (actor.totp === "tidak_perlu" || actor.totp === "lolos") redirect("/staf");

  const enrolling = actor.totp === "perlu_daftar";
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-semibold">Verifikasi TOTP</h1>
        </CardTitle>
        <CardDescription>
          {enrolling
            ? "Admin Platform wajib memakai aplikasi authenticator (misalnya Google Authenticator atau Aegis) di samping Kode Masuk. Daftarkan sekali, lalu masukkan kodenya setiap kali masuk."
            : "Masukkan kode 6 angka dari aplikasi authenticator Anda."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TotpForm enrolling={enrolling} />
      </CardContent>
    </Card>
  );
}
