"use client";

import { useActionState } from "react";
import { kirimKodeVerifikasi, konfirmasiVerifikasi, simpanNomorTelepon } from "@/app/akun/email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialEmailProfileState, initialEmailRequestState, type EmailProfileState } from "@/components/email/state";

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
 * The Akun's Email Terverifikasi (its key) in Akun Saya and the staff area.
 * It changes only through Verifikasi email: a code to the new address, and the
 * old Email Terverifikasi stays until the code is entered. It is never removed.
 */
export function EmailSection({ email }: { email: string }) {
  const [sent, send, sending] = useActionState(kirimKodeVerifikasi, initialEmailRequestState);
  const [confirmed, confirm, confirming] = useActionState(konfirmasiVerifikasi, initialEmailProfileState);
  const awaitingCode = sent.status === "terkirim" && confirmed.status !== "berhasil";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium" data-testid="akun-email">
          {email}
        </span>
        {" · "}
        <span className="text-success-soft-foreground">Email Terverifikasi</span>
      </p>

      <form action={send} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email baru
          <Input name="email" type="email" autoComplete="email" required placeholder="nama@contoh.id" className="h-10 px-3" />
        </label>
        <Button type="submit" variant="outline" disabled={sending} className="self-start">
          {sending ? "Mengirim…" : "Verifikasi email"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Kami mengirim kode ke email baru itu. Email Terverifikasi Anda baru berganti setelah kodenya dimasukkan; sampai
          saat itu Kode Masuk tetap dikirim ke email yang sekarang.
        </p>
        {sent.status === "gagal" ? <Feedback state={sent} /> : null}
      </form>

      {awaitingCode ? (
        <form action={confirm} className="flex flex-col gap-3">
          <p role="status" className="text-sm">
            {sent.message}
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Kode dari email
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className="h-10 px-3 text-center tracking-[0.5em]"
            />
          </label>
          <Button type="submit" disabled={confirming} className="self-start">
            {confirming ? "Memeriksa…" : "Simpan email baru"}
          </Button>
          {confirmed.status === "gagal" ? <Feedback state={confirmed} /> : null}
        </form>
      ) : null}
      {confirmed.status === "berhasil" ? <Feedback state={confirmed} /> : null}
    </div>
  );
}

/** The Akun's phone number: a contact that staff call, edited freely, never verified and never used to log in. */
export function PhoneSection({ phoneNumber }: { phoneNumber: string | null }) {
  const [saved, save, saving] = useActionState(simpanNomorTelepon, initialEmailProfileState);

  return (
    <form action={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor telepon
        <Input
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={phoneNumber ?? ""}
          placeholder="0812 3456 7890"
          className="h-10 px-3"
          data-testid="akun-phone-number"
        />
      </label>
      <Button type="submit" variant="outline" disabled={saving} className="self-start">
        {saving ? "Menyimpan…" : "Simpan nomor telepon"}
      </Button>
      {phoneNumber ? null : (
        <p className="text-xs text-muted-foreground">Belum ada nomor telepon. Isi agar staf bisa menghubungi Anda.</p>
      )}
      <Feedback state={saved} />
    </form>
  );
}
