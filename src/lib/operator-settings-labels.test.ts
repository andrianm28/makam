import { describe, expect, it } from "vitest";
import { operatorSettingsFieldLabels } from "./operator-settings-labels";

/** One name per field of Pengaturan Operator, for the form's label and its refusal alike. */
describe("how each field of Pengaturan Operator is named", () => {
  it("names all six fields, and every one of them carries a label", () => {
    expect(Object.keys(operatorSettingsFieldLabels)).toEqual([
      "legalName",
      "address",
      "phone",
      "email",
      "csWhatsApp",
      "csReplyHours",
    ]);
    for (const label of Object.values(operatorSettingsFieldLabels)) expect(label.trim()).not.toEqual("");
  });

  it("says who a value belongs to, in the words the Operator's documents use", () => {
    expect(operatorSettingsFieldLabels.legalName).toBe("Nama resmi Operator");
    expect(operatorSettingsFieldLabels.csWhatsApp).toBe("Nomor WhatsApp CS");
    expect(operatorSettingsFieldLabels.csReplyHours).toBe("Jam balas CS");
  });
});
