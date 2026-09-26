"use client";

import { useActionState } from "react";
import { hapusEmail, kirimKodeVerifikasi, konfirmasiVerifikasi } from "@/app/akun/email-actions";
import { Button } from "@/components/ui/button";
import { initialEmailProfileState, initialEmailRequestState, type EmailProfileState } from "./state";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Feedback({ state }: { state: EmailProfileState | { status: "gagal"; message: string } | { status: "idle" } }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-success-soft-foreground">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

/**
 * The Akun's email in Akun Saya and the staff area. It is added or changed
 * only through Verifikasi Email (a code to the new address; the old Email
 * Terverifikasi stays until the code is entered), and a Pemesan may remove it.
 * An Akun Staf may not remove it.
 */
export function EmailSection({
  email,
  verified,
  canRemove,
}: {
  email: string | null;
  verified: boolean;
  /** False for an Akun Staf, which must keep an email. */
  canRemove: boolean;
}) {
  const [removed, remove, removing] = useActionState(hapusEmail, initialEmailProfileState);
  const [sent, send, sending] = useActionState(kirimKodeVerifikasi, initialEmailRequestState);
  const [confirmed, confirm, confirming] = useActionState(konfirmasiVerifikasi, initialEmailProfileState);
  const awaitingCode = sent.status === "terkirim" && confirmed.status !== "berhasil";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {email ? (
          <>
            <span className="font-medium">{email}</span>
            {" · "}
          </>
        ) : null}
        <span
          data-testid="akun-email-status"
          className={verified ? "text-success-soft-foreground" : "text-muted-foreground"}
        >
          {email ? (verified ? "Terverifikasi" : "Belum terverifikasi") : "Belum ada email"}
        </span>
      </p>

      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email ?? ""}
            placeholder="nama@contoh.id"
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" formAction={send} disabled={sending}>
            {sending ? "Mengirim…" : "Kirim kode verifikasi"}
          </Button>
          {canRemove && email ? (
            <Button type="submit" variant="ghost" formAction={remove} formNoValidate disabled={removing}>
              Hapus email
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Email baru disimpan setelah kode verifikasi yang kami kirim ke email itu dimasukkan. Sampai saat itu email
          terverifikasi Anda yang lama tetap dipakai.
        </p>
        <Feedback state={removed} />
        {sent.status === "gagal" ? <Feedback state={sent} /> : null}
      </form>

      {awaitingCode ? (
        <form action={confirm} className="flex flex-col gap-3">
          <p role="status" className="text-sm">
            {sent.message}
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Kode dari email
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className={`${inputClass} text-center tracking-[0.5em]`}
            />
          </label>
          <Button type="submit" disabled={confirming} className="self-start">
            {confirming ? "Memeriksa…" : "Verifikasi email"}
          </Button>
          {confirmed.status === "gagal" ? <Feedback state={confirmed} /> : null}
        </form>
      ) : null}
      {confirmed.status === "berhasil" ? <Feedback state={confirmed} /> : null}
    </div>
  );
}
