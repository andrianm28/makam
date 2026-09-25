"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../messages";

export type EnrolState =
  | { status: "idle" }
  | { status: "kunci"; secret: string; otpauthUri: string }
  | { status: "gagal"; message: string };

export type VerifyTotpState = { status: "idle" } | { status: "gagal"; message: string };

/** Starts TOTP enrolment: shows the secret for the authenticator app. */
export async function mulaiDaftarTotp(): Promise<EnrolState> {
  const result = await guarded({
    action: "akun.totp",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({}),
    input: {},
    run: (actor) => serverRuntime().identity.startTotpEnrolment(actor),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const enrolment = result.value;
  if (!enrolment.ok) {
    return {
      status: "gagal",
      message:
        enrolment.reason === "totp_sudah_terdaftar"
          ? "Authenticator sudah terdaftar. Masukkan kodenya di bawah."
          : "Akun ini tidak memerlukan TOTP.",
    };
  }
  return { status: "kunci", secret: enrolment.secret, otpauthUri: enrolment.otpauthUri };
}

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/** Checks the authenticator code; on success the staff area opens. */
export async function verifikasiTotp(_previous: VerifyTotpState, formData: FormData): Promise<VerifyTotpState> {
  const result = await guarded({
    action: "akun.totp",
    resource: (actor) => akunResource(actor.accountId),
    schema: codeSchema,
    input: { code: formData.get("code") },
    run: (actor, data) => serverRuntime().identity.passTotp(actor, data.code),
  });
  if (!result.ok) {
    if (result.error === "input_tidak_valid") return { status: "gagal", message: "Masukkan 6 angka dari aplikasi authenticator." };
    return { status: "gagal", message: guardMessage(result.error) };
  }
  const passed = result.value;
  if (passed.ok) redirect("/staf");
  switch (passed.reason) {
    case "kode_salah":
      return { status: "gagal", message: "Kode authenticator salah. Periksa jam ponsel Anda dan coba kode terbaru." };
    case "kode_sudah_dipakai":
      return { status: "gagal", message: "Kode ini sudah dipakai. Tunggu kode berikutnya." };
    case "sesi_diakhiri":
      redirect("/masuk?sesi=berakhir");
    case "belum_daftar":
      return { status: "gagal", message: "Daftarkan aplikasi authenticator dulu." };
    case "belum_masuk":
      redirect("/masuk");
    case "tidak_perlu_totp":
      redirect("/staf");
  }
}
