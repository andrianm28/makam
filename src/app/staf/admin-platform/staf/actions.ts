"use server";

import { revalidatePath } from "next/cache";
import { stafResource, type InviteStaffResult } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { staffRoleLabels } from "@/lib/staff-role-labels";
import { nonaktifkanStafSchema, undangStafSchema } from "./schema";

/** Admin Platform sends an Undangan Staf. */
export async function undangStaf(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "staf.undang",
    resource: () => stafResource(),
    schema: undangStafSchema,
    input: {
      email: formData.get("email"),
      phoneNumber: formData.get("phoneNumber"),
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
      ? `Undangan ${label} terkirim ke ${invited.invite.email}. Berlaku 7 hari: minta ia masuk lewat /masuk dengan email itu.`
      : `Undangan ${label} untuk ${invited.invite.email} tercatat, tetapi emailnya gagal terkirim. Minta ia masuk lewat /masuk dengan email itu dalam 7 hari.`,
  };
}

function inviteRefusal(refusal: Extract<InviteStaffResult, { ok: false }>): string {
  switch (refusal.reason) {
    case "email_wajib":
      return "Email wajib diisi untuk setiap staf.";
    case "email_tidak_valid":
      return "Email tidak valid.";
    case "lokasi_wajib":
      return "Admin Lokasi diundang dari halaman Lokasi Mitra-nya (menu Lokasi Mitra).";
    case "nomor_tidak_valid":
    case "nomor_bukan_indonesia":
      return phoneNumberRefusals[refusal.reason];
    case "perlu_totp":
    case "tidak_berwenang":
      return guardMessage(refusal.reason);
  }
}

/** Admin Platform deactivates an Akun Staf. */
export async function nonaktifkanStaf(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await guarded({
    fitur: "inti",
    action: "staf.nonaktifkan",
    resource: () => stafResource(),
    schema: nonaktifkanStafSchema,
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
  return { status: "berhasil", message: "Akun Staf dinonaktifkan: perannya dicabut dan sesinya diakhiri." };
}
