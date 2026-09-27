"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mulaiDaftarTotp, verifikasiTotp, type EnrolState, type VerifyTotpState } from "./actions";

/** Enrol (show the secret) when needed, then type the authenticator code. */
export function TotpForm({ enrolling }: { enrolling: boolean }) {
  const [enrolment, enrol, enrolPending] = useActionState<EnrolState>(mulaiDaftarTotp, { status: "idle" });
  const [verify, submit, verifying] = useActionState<VerifyTotpState, FormData>(verifikasiTotp, { status: "idle" });
  const showCode = !enrolling || enrolment.status === "kunci";

  return (
    <div className="flex flex-col gap-5">
      {enrolling ? (
        enrolment.status === "kunci" ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>Tambahkan akun baru di aplikasi authenticator dengan kunci ini (jenis: berbasis waktu):</p>
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wider" data-testid="totp-secret">
              {enrolment.secret.match(/.{1,4}/g)?.join(" ")}
            </code>
            <a href={enrolment.otpauthUri} className="font-medium text-brand underline underline-offset-4">
              Buka di aplikasi authenticator (ponsel ini)
            </a>
            <p className="text-muted-foreground">
              Simpan kunci ini dengan aman: tidak ada pemulihan mandiri bila ponsel hilang.
            </p>
          </div>
        ) : (
          <form action={enrol} className="flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={enrolPending}>
              Daftarkan aplikasi authenticator
            </Button>
            {enrolment.status === "gagal" ? (
              <p role="alert" className="text-sm text-destructive">
                {enrolment.message}
              </p>
            ) : null}
          </form>
        )
      ) : null}

      {showCode ? (
        <form action={submit} className="flex flex-col gap-3">
          <label htmlFor="totp-code" className="text-sm font-medium">
            Kode authenticator
          </label>
          <Input
            id="totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="h-11 px-3 text-center text-lg tracking-[0.5em]"
          />
          {verify.status === "gagal" ? (
            <p role="alert" className="text-sm text-destructive">
              {verify.message}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={verifying}>
            Verifikasi
          </Button>
        </form>
      ) : null}
    </div>
  );
}
