"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffRoleLabels, staffRoles, stafResource, type InviteStaffResult } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "../../messages";

export type FormState = { status: "idle" } | { status: "berhasil" | "gagal"; message: string };

const inviteSchema = z.object({
  phoneNumber: phoneNumberInput,
  // Empty is let through: the identity module refuses a missing email (email_wajib) with its own message.
  email: z.string().trim().max(254),
  role: z.enum(staffRoles),
  reason: z.string().trim().max(500).optional(),
});

/** Admin Platform sends an Undangan Staf. */
export async function undangStaf(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "staf.undang",
    resource: () => stafResource(),
    schema: inviteSchema,
    input: {
      phoneNumber: formData.get("phoneNumber"),
      email: formData.get("email"),
      role: formData.get("role"),
      reason: formData.get("reason") ?? undefined,
    },
    run: (actor, data) => serverRuntime().identity.inviteStaff(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const invited = result.value;
  if (!invited.ok) return { status: "gagal", message: inviteRefusal(invited) };
  revalidatePath("/staf/admin-platform/staf");
  const label = staffRoleLabels[invited.invite.role];
  return {
    status: "berhasil",
    message: invited.delivered
      ? `Undangan ${label} terkirim ke ${invited.invite.phoneNumber}. Berlaku 7 hari: minta ia masuk lewat /masuk dengan nomor itu.`
      : `Undangan ${label} untuk ${invited.invite.phoneNumber} tercatat, tetapi pesan WhatsApp gagal terkirim. Minta ia masuk lewat /masuk dengan nomor itu dalam 7 hari.`,
  };
}

function inviteRefusal(refusal: Extract<InviteStaffResult, { ok: false }>): string {
  switch (refusal.reason) {
    case "email_wajib":
      return "Email wajib diisi untuk setiap staf.";
    case "email_tidak_valid":
      return "Email tidak valid.";
    case "nomor_tidak_valid":
      return "Nomor WhatsApp tidak valid.";
    case "nomor_bukan_indonesia":
      return "Gunakan nomor WhatsApp Indonesia (+62).";
    case "perlu_totp":
    case "tidak_berwenang":
      return guardMessage(refusal.reason);
  }
}

const deactivateSchema = z.object({ accountId: z.string().min(1).max(64), reason: z.string().trim().max(500) });

/** Admin Platform deactivates an Akun Staf. */
export async function nonaktifkanStaf(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    action: "staf.nonaktifkan",
    resource: () => stafResource(),
    schema: deactivateSchema,
    input: { accountId: formData.get("accountId"), reason: formData.get("reason") },
    run: (actor, data) => serverRuntime().identity.deactivateStaff(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const deactivated = result.value;
  if (!deactivated.ok) {
    const messages: Record<typeof deactivated.reason, string> = {
      alasan_wajib: "Tulis alasannya.",
      bukan_akun_staf: "Akun ini bukan Akun Staf.",
      akun_sendiri: "Anda tidak bisa menonaktifkan Akun Anda sendiri.",
      sudah_dinonaktifkan: "Akun ini sudah dinonaktifkan.",
      perlu_totp: guardMessage("perlu_totp"),
      tidak_berwenang: guardMessage("tidak_berwenang"),
    };
    return { status: "gagal", message: messages[deactivated.reason] };
  }
  revalidatePath("/staf/admin-platform/staf");
  return { status: "berhasil", message: "Akun Staf dinonaktifkan." };
}
