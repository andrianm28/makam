"use server";

import { revalidatePath } from "next/cache";
import { pengaturanOperatorResource } from "@/domain/identity";
import {
  operatorSettingsFields,
  type ChangeOperatorSettingsResult,
  type OperatorSettingsField,
} from "@/domain/operator-settings";
import { guarded } from "@/server/guard";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { serverRuntime } from "@/server/runtime";
import type { FormState } from "../../form-state";
import { guardMessage } from "../../messages";
import { pengaturanOperatorSchema } from "./schema";

const fields = [...operatorSettingsFields, "reason"] as const;

/** The form's state: on a refusal it carries what was typed back, so a caller driving the action itself (not through react-hook-form) can put the one fix back in the fields. */
export type PengaturanOperatorFormState = FormState & { typed?: Record<(typeof fields)[number], string> };

/** Admin Platform saves Pengaturan Operator: a new version in force from now, audited. */
export async function simpanPengaturanOperator(
  _previous: PengaturanOperatorFormState,
  formData: FormData,
): Promise<PengaturanOperatorFormState> {
  let typed: PengaturanOperatorFormState["typed"];
  const result = await guarded({
    action: "pengaturan_operator.ubah",
    resource: () => pengaturanOperatorResource(),
    schema: pengaturanOperatorSchema,
    input: Object.fromEntries(fields.map((name) => [name, formData.get(name) ?? ""])),
    run: (actor, data) => {
      typed = data;
      return serverRuntime().operatorSettings.change(actor, data);
    },
  });
  if (!result.ok) return { status: "gagal", message: guardMessage(result.error), typed };
  const changed = result.value;
  if (!changed.ok) return { status: "gagal", message: refusal(changed), typed };
  revalidatePath("/staf/admin-platform/pengaturan-operator");
  return { status: "berhasil", message: "Pengaturan Operator disimpan dan berlaku mulai sekarang." };
}

const fieldLabels: Record<OperatorSettingsField, string> = {
  legalName: "Nama resmi Operator",
  address: "Alamat terdaftar",
  phone: "Telepon Operator",
  email: "Email Operator",
  csWhatsApp: "Nomor WhatsApp CS",
  csReplyHours: "Jam balas CS",
};

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
