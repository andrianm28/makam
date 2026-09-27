"use server";

import { revalidatePath } from "next/cache";
import { pengaturanOperatorResource } from "@/domain/identity";
import {
  operatorSettingsFields,
  type ChangeOperatorSettingsResult,
} from "@/domain/operator-settings";
import { operatorSettingsFieldLabels } from "@/lib/operator-settings-labels";
import { guarded } from "@/server/guard";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { pengaturanOperatorSchema } from "./schema";

const fields = [...operatorSettingsFields, "reason"] as const;

/**
 * Admin Platform saves Pengaturan Operator: a new version in force from now,
 * audited. On a refusal nothing but the message comes back — the form on
 * react-hook-form keeps what was typed in its own fields, for the one fix.
 */
export async function simpanPengaturanOperator(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await guarded({
    action: "pengaturan_operator.ubah",
    resource: () => pengaturanOperatorResource(),
    schema: pengaturanOperatorSchema,
    input: Object.fromEntries(fields.map((name) => [name, formData.get(name) ?? ""])),
    run: (actor, data) => serverRuntime().operatorSettings.change(actor, data),
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error) };
  const changed = result.value;
  if (!changed.ok) return { status: "gagal", message: refusal(changed) };
  revalidatePath("/staf/admin-platform/pengaturan-operator");
  return { status: "berhasil", message: "Pengaturan Operator disimpan dan berlaku mulai sekarang." };
}

function refusal(refused: Extract<ChangeOperatorSettingsResult, { ok: false }>): string {
  switch (refused.reason) {
    case "isian_wajib":
      return `${operatorSettingsFieldLabels[refused.field]} wajib diisi.`;
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
