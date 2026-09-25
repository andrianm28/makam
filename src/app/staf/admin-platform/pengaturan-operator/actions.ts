"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pengaturanOperatorResource } from "@/domain/identity";
import type { ChangeOperatorSettingsResult } from "@/domain/operator-settings";
import { guarded } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";

// Only shapes and lengths here; the operator-settings module trims, checks and normalises.
const schema = z.object({
  legalName: z.string().max(200),
  address: z.string().max(500),
  phone: z.string().max(32),
  email: z.string().max(254),
  csWhatsApp: phoneNumberInput,
  csReplyHours: z.string().max(200),
  reason: z.string().max(500),
});

const fields = ["legalName", "address", "phone", "email", "csWhatsApp", "csReplyHours", "reason"] as const;

/** The form's state: on a refusal it carries what was typed back, since React resets the form after an action. */
export type PengaturanOperatorFormState = FormState & { typed?: Record<(typeof fields)[number], string> };

/** Admin Platform saves Pengaturan Operator: a new version in force from now, audited. */
export async function simpanPengaturanOperator(
  _previous: PengaturanOperatorFormState,
  formData: FormData,
): Promise<PengaturanOperatorFormState> {
  const input = Object.fromEntries(fields.map((name) => [name, formData.get(name) ?? ""]));
  const result = await guarded({
    action: "pengaturan_operator.ubah",
    resource: () => pengaturanOperatorResource(),
    schema,
    input,
    run: (actor, data) => serverRuntime().operatorSettings.change(actor, data),
  });
  const typed = schema.safeParse(input).data;
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error), typed };
  const changed = result.value;
  if (!changed.ok) return { status: "gagal", message: refusal(changed), typed };
  revalidatePath("/staf/admin-platform/pengaturan-operator");
  return { status: "berhasil", message: "Pengaturan Operator disimpan dan berlaku mulai sekarang." };
}

const fieldLabels = {
  legalName: "Nama resmi Operator",
  address: "Alamat terdaftar",
  phone: "Telepon Operator",
  email: "Email Operator",
  csWhatsApp: "Nomor WhatsApp CS",
  csReplyHours: "Jam balas CS",
} as const;

function refusal(refused: Extract<ChangeOperatorSettingsResult, { ok: false }>): string {
  switch (refused.reason) {
    case "isian_wajib":
      return `${fieldLabels[refused.field]} wajib diisi.`;
    case "email_tidak_valid":
      return "Email Operator tidak valid.";
    case "nomor_tidak_valid":
    case "nomor_bukan_indonesia":
      return `Nomor WhatsApp CS: ${phoneNumberRefusals[refused.reason]}`;
    case "perlu_totp":
    case "tidak_berwenang":
      return guardMessage(refused.reason);
  }
}
