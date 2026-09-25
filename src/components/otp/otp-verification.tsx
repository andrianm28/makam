"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { initialOtpVerifyState, type OtpRequestState, type OtpVerifyState } from "./state";

type Sent = Extract<OtpRequestState, { status: "terkirim" }>;

export interface OtpVerificationProps {
  /** The send this screen is for; give the component `key={sent.sentAt}` so a re-send restarts it. */
  sent: Sent;
  /** Checks the code (a Server Action taking `phoneNumber` and `code`). */
  verifyAction: (state: OtpVerifyState, formData: FormData) => Promise<OtpVerifyState>;
  /** Sends a new code (the dispatch of the caller's `useActionState` for the request action). */
  resendAction: (formData: FormData) => void;
  resendPending?: boolean;
  /** Why the last re-send was refused, if it was. */
  resendError?: string;
  submitLabel?: string;
  /**
   * The fallback slot: shown about 60 s after the WhatsApp OTP was sent.
   * Ticket 60 puts "Kirim lewat email" (or the CS WhatsApp pointer) here.
   */
  fallback?: ReactNode;
}

/**
 * The OTP screen: code entry, Kirim ulang, and the fallback slot. Used by
 * Masuk and, later, by Kirim in the booking wizards.
 */
export function OtpVerification({
  sent,
  verifyAction,
  resendAction,
  resendPending = false,
  resendError,
  submitLabel = "Verifikasi",
  fallback,
}: OtpVerificationProps) {
  const [verifyState, verify, verifying] = useActionState(verifyAction, initialOtpVerifyState);
  const resendIn = useCountdown(sent.resendInSeconds);
  const fallbackIn = useCountdown(sent.fallbackInSeconds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Masukkan kode verifikasi</h2>
        <p className="text-sm text-muted-foreground">
          Kami mengirim kode 6 angka lewat WhatsApp ke{" "}
          <span className="font-medium text-foreground" data-testid="otp-phone-number">
            {sent.phoneNumber}
          </span>
          .
        </p>
        <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="otp-phone-only-notice">
          Buka WhatsApp di ponsel Anda. Kode hanya muncul di ponsel, tidak di WhatsApp Web atau WhatsApp Desktop.
        </p>
      </div>

      <form action={verify} className="flex flex-col gap-3">
        <input type="hidden" name="phoneNumber" value={sent.phoneNumber} />
        <label htmlFor="otp-code" className="text-sm font-medium">
          Kode verifikasi
        </label>
        <input
          id="otp-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="h-11 rounded-lg border border-input bg-background px-3 text-center text-lg tracking-[0.5em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {verifyState.status === "gagal" ? (
          <p role="alert" className="text-sm text-destructive">
            {verifyState.message}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={verifying}>
          {verifying ? "Memeriksa…" : submitLabel}
        </Button>
      </form>

      <form action={resendAction} className="flex flex-col gap-2">
        <input type="hidden" name="phoneNumber" value={sent.phoneNumber} />
        <Button type="submit" variant="outline" disabled={resendIn > 0 || resendPending}>
          {resendIn > 0 ? `Kirim ulang kode (${resendIn} detik)` : "Kirim ulang kode"}
        </Button>
        {resendError ? (
          <p role="alert" className="text-sm text-destructive">
            {resendError}
          </p>
        ) : null}
      </form>

      {fallbackIn === 0 ? (
        <div data-testid="otp-fallback-slot" className="flex flex-col gap-2 text-sm">
          {fallback}
        </div>
      ) : null}
    </div>
  );
}

/** Whole seconds left, counting down from `seconds` once the screen is shown. */
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
