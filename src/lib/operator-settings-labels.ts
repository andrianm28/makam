import type { OperatorSettingsField } from "@/domain/operator-settings";

/**
 * How each field of Pengaturan Operator is named on screen, once: the form's
 * label and the refusal that says a value is needed both read from here, so a
 * field is never called one thing in the field and another in the message.
 */
export const operatorSettingsFieldLabels: Record<OperatorSettingsField, string> = {
  legalName: "Nama resmi Operator",
  address: "Alamat terdaftar",
  phone: "Telepon Operator",
  email: "Email Operator",
  csWhatsApp: "Nomor WhatsApp CS",
  csReplyHours: "Jam balas CS",
};
