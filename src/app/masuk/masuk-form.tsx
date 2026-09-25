"use client";

import { useActionState, useState } from "react";
import { OtpVerification } from "@/components/otp/otp-verification";
import { initialOtpRequestState, type OtpRequestState } from "@/components/otp/state";
import { Button } from "@/components/ui/button";
import { kirimOtp, masukDenganOtp } from "./actions";

/** Masuk: a WhatsApp number, then its OTP. Works for a number with no account or orders yet. */
export function MasukForm() {
  const [state, request, requesting] = useActionState(kirimOtp, initialOtpRequestState);
  const sent = useLastSent(state);

  if (sent) {
    return (
      <OtpVerification
        key={sent.sentAt}
        sent={sent}
        verifyAction={masukDenganOtp}
        resendAction={request}
        resendPending={requesting}
        resendError={state.status === "gagal" ? state.message : undefined}
        submitLabel="Masuk"
        fallback={
          <p className="text-muted-foreground">
            Kode belum masuk? Pastikan nomor WhatsApp di atas benar dan ponsel Anda tersambung ke internet, lalu kirim
            ulang kode.
          </p>
        }
      />
    );
  }

  return (
    <form action={request} className="flex flex-col gap-3">
      <label htmlFor="phoneNumber" className="text-sm font-medium">
        Nomor WhatsApp
      </label>
      <input
        id="phoneNumber"
        name="phoneNumber"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0812 3456 7890"
        defaultValue={state.status === "gagal" ? state.phoneNumber : undefined}
        required
        className="h-11 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.status === "gagal" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={requesting}>
        {requesting ? "Mengirim…" : "Kirim kode lewat WhatsApp"}
      </Button>
    </form>
  );
}

type Sent = Extract<OtpRequestState, { status: "terkirim" }>;

/**
 * The last successful send stays on screen when a later re-send is refused,
 * so the Pemesan can still type the code they have.
 */
function useLastSent(state: OtpRequestState): Sent | null {
  const [lastSent, setLastSent] = useState<Sent | null>(null);
  // Adjusting state while rendering (React's pattern for state derived from props).
  if (state.status === "terkirim" && lastSent?.sentAt !== state.sentAt) setLastSent(state);
  return state.status === "terkirim" ? state : lastSent;
}
