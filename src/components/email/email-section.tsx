"use client";

import { useActionState } from "react";
import { hapusEmail, kirimKodeVerifikasi, konfirmasiVerifikasi, simpanEmail } from "@/app/akun/email-actions";
import { Button } from "@/components/ui/button";
import { initialEmailProfileState, initialEmailRequestState, type EmailProfileState } from "./state";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Feedback({ state }: { state: EmailProfileState | { status: "gagal"; message: string } | { status: "idle" } }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

/**
 * The Akun's email in Akun Saya and the staff area: save it (unverified),
 * Verifikasi Email with a code sent to it, and (a Pemesan only) remove it.
 * Only an Email Terverifikasi can be used for Masuk dengan email.
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
  const [saved, save, saving] = useActionState(simpanEmail, initialEmailProfileState);
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
          className={verified ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}
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
          <Button type="submit" variant="outline" formAction={save} disabled={saving}>
            Simpan tanpa verifikasi
          </Button>
          {canRemove && email ? (
            <Button type="submit" variant="ghost" formAction={remove} formNoValidate disabled={removing}>
              Hapus email
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Email yang belum terverifikasi hanya dipakai untuk salinan dokumen. Verifikasi untuk bisa masuk dengan email.
          Email terverifikasi Anda tetap dipakai sampai kode untuk email baru dimasukkan.
        </p>
        <Feedback state={saved} />
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
