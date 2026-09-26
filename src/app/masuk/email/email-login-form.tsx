"use client";

import { useActionState, useEffect, useState } from "react";
import { initialEmailRequestState } from "@/components/email/state";
import { initialOtpVerifyState } from "@/components/otp/state";
import { Button } from "@/components/ui/button";
import { kirimKodeEmail, masukDenganEmail } from "../actions";

const inputClass =
  "h-11 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Masuk dengan email: an email, then the Kode Masuk sent to it (only to an Email Terverifikasi). */
export function EmailLoginForm() {
  const [requested, request, requesting] = useActionState(kirimKodeEmail, initialEmailRequestState);
  const [verified, verify, verifying] = useActionState(masukDenganEmail, initialOtpVerifyState);

  if (requested.status === "terkirim") {
    return (
      <div className="flex flex-col gap-5">
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="email-login-reply">
          {requested.message}
        </p>
        <form action={verify} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={requested.email} />
          <label htmlFor="email-code" className="text-sm font-medium">
            Kode dari email
          </label>
          <input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className={`${inputClass} text-center text-lg tracking-[0.5em]`}
          />
          {verified.status === "gagal" ? (
            <p role="alert" className="text-sm text-destructive">
              {verified.message}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>
        <ResendForm key={requested.sentAt} email={requested.email} seconds={requested.resendInSeconds} action={request} pending={requesting} />
      </div>
    );
  }

  return (
    <form action={request} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nama@contoh.id"
        defaultValue={requested.status === "gagal" ? requested.email : undefined}
        required
        className={inputClass}
      />
      {requested.status === "gagal" ? (
        <p role="alert" className="text-sm text-destructive">
          {requested.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={requesting}>
        {requesting ? "Mengirim…" : "Kirim kode lewat email"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Hanya untuk akun yang emailnya sudah diverifikasi di Akun Saya. Belum punya akun? Masuk dengan nomor WhatsApp.
      </p>
    </form>
  );
}

function ResendForm({
  email,
  seconds,
  action,
  pending,
}: {
  email: string;
  seconds: number;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const left = useCountdown(seconds);
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" disabled={left > 0 || pending} className="w-full">
        {left > 0 ? `Kirim ulang kode (${left} detik)` : "Kirim ulang kode"}
      </Button>
    </form>
  );
}

/** Whole seconds left, counting down from `seconds` once shown. */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const endsAt = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}
