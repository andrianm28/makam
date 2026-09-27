"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  csWhatsAppLink,
  initialKodeMasukRequestState,
  initialKodeMasukVerifyState,
  type CsContact,
  type KodeMasukRequestState,
  type KodeMasukVerifyState,
} from "./state";

export interface KodeMasukFormProps {
  /** Sends a Kode Masuk to the `email` field (a Server Action; the identity module's requestKodeMasuk). */
  requestAction: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  /** Checks the Kode Masuk (a Server Action taking `email` and `code`; the identity module's verifyKodeMasuk). */
  verifyAction: (state: KodeMasukVerifyState, formData: FormData) => Promise<KodeMasukVerifyState>;
  /** The label of the button that enters the code, e.g. "Masuk" or "Kirim pesanan". */
  submitLabel?: string;
  /** The CS WhatsApp contact from Pengaturan Operator (`current()`); null while it is not entered. */
  csContact: CsContact | null;
  /**
   * The email the code is sent to without asking for it again: the wizard's
   * "Data & kirim" already collected it (spec, Booking wizards: the email field
   * with the Kode Masuk at Kirim, prefilled). Masuk leaves it empty.
   */
  defaultEmail?: string;
}

/**
 * The Kode Masuk: one email field, then the 6-digit code sent to it. The
 * code logs into the Akun of that email or creates it (spec, Identity &
 * Access), so the same form serves Masuk and Kirim in the booking wizards.
 * Under the email field: "Tidak punya email? Minta bantuan CS".
 */
export function KodeMasukForm({ requestAction, verifyAction, submitLabel = "Masuk", csContact, defaultEmail }: KodeMasukFormProps) {
  const [state, request, requesting] = useActionState(requestAction, initialKodeMasukRequestState);
  const [changingEmail, setChangingEmail] = useState(false);
  const sent = useLastSent(state, () => setChangingEmail(false));

  if (sent && !changingEmail) {
    return (
      <CodeStep
        key={sent.sentAt}
        sent={sent}
        verifyAction={verifyAction}
        resendAction={request}
        resendPending={requesting}
        resendError={state.status === "gagal" ? state.message : undefined}
        submitLabel={submitLabel}
        onChangeEmail={() => setChangingEmail(true)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={request} className="flex flex-col gap-3">
        <label htmlFor="kode-masuk-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="kode-masuk-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nama@contoh.id"
          defaultValue={state.status === "gagal" ? state.email : (sent?.email ?? defaultEmail ?? "")}
          required
          className="h-11 px-3"
        />
        {state.status === "gagal" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={requesting}>
          {requesting ? "Mengirim…" : "Kirim Kode Masuk"}
        </Button>
      </form>
      <CsHelp contact={csContact} />
    </div>
  );
}

type Sent = Extract<KodeMasukRequestState, { status: "terkirim" }>;

function CodeStep({
  sent,
  verifyAction,
  resendAction,
  resendPending,
  resendError,
  submitLabel,
  onChangeEmail,
}: {
  sent: Sent;
  verifyAction: KodeMasukFormProps["verifyAction"];
  resendAction: (formData: FormData) => void;
  resendPending: boolean;
  resendError?: string;
  submitLabel: string;
  onChangeEmail: () => void;
}) {
  const [verifyState, verify, verifying] = useActionState(verifyAction, initialKodeMasukVerifyState);
  const resendIn = useCountdown(sent.resendInSeconds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-title-2 text-foreground">Masukkan Kode Masuk</h2>
        <p role="status" className="text-sm text-muted-foreground" data-testid="kode-masuk-terkirim">
          Kode Masuk 6 angka sudah kami kirim ke{" "}
          <span className="font-medium text-foreground" data-testid="kode-masuk-email">
            {sent.email}
          </span>
          . Kode berlaku 10 menit. Tidak ada di kotak masuk? Periksa folder spam.
        </p>
      </div>

      <form action={verify} className="flex flex-col gap-3">
        <input type="hidden" name="email" value={sent.email} />
        <label htmlFor="kode-masuk-code" className="text-sm font-medium">
          Kode Masuk
        </label>
        <Input
          id="kode-masuk-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="h-11 px-3 text-center text-lg tracking-[0.5em]"
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
        <input type="hidden" name="email" value={sent.email} />
        <Button type="submit" variant="outline" disabled={resendIn > 0 || resendPending}>
          {resendIn > 0 ? `Kirim ulang kode (${resendIn} detik)` : "Kirim ulang kode"}
        </Button>
        {resendError ? (
          <p role="alert" className="text-sm text-destructive">
            {resendError}
          </p>
        ) : null}
      </form>

      <Button type="button" variant="ghost" onClick={onChangeEmail}>
        Ganti email
      </Button>
    </div>
  );
}

/**
 * "Tidak punya email? Minta bantuan CS": a wa.me link to the CS number
 * (`csWhatsApp`) from Pengaturan Operator, with its reply hours and the number itself.
 * While Pengaturan Operator is empty it names no number.
 */
export function CsHelp({ contact }: { contact: CsContact | null }) {
  if (!contact) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="kode-masuk-cs">
        Tidak punya email? Minta bantuan CS Makam.co.id: CS dapat mengirim pesanan atas nama keluarga Anda.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" data-testid="kode-masuk-cs">
      <a href={csWhatsAppLink(contact)} className="font-medium text-brand underline underline-offset-4" target="_blank" rel="noopener">
        Tidak punya email? Minta bantuan CS
      </a>{" "}
      di <span className="font-medium text-foreground">{contact.whatsApp}</span> ({contact.replyHours}). CS dapat
      mengirim pesanan atas nama keluarga Anda.
    </p>
  );
}

/**
 * The last successful send stays on screen when a later re-send is refused,
 * so the code already received can still be typed. `onNewSend` runs for each new send.
 */
function useLastSent(state: KodeMasukRequestState, onNewSend: () => void): Sent | null {
  const [lastSent, setLastSent] = useState<Sent | null>(null);
  // Adjusting state while rendering (React's pattern for state derived from props).
  if (state.status === "terkirim" && lastSent?.sentAt !== state.sentAt) {
    setLastSent(state);
    onNewSend();
  }
  return state.status === "terkirim" ? state : lastSent;
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
