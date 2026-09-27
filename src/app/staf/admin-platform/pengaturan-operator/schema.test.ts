import { describe, expect, it } from "vitest";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { pengaturanOperatorSchema } from "./schema";

/** The Pengaturan Operator form validates with the same schema its Server Action uses. */
describe("pengaturanOperatorSchema", () => {
  const valid = {
    legalName: "PT Jaya Korpora Prima",
    address: "Jl. Contoh No. 1, Jakarta Selatan",
    phone: "(021) 555-0101",
    email: "halo@makam.co.id",
    csWhatsApp: "08115550101",
    csReplyHours: "dibalas mulai pukul 06:00",
    reason: "Isian awal",
  };

  it("accepts a complete entry", () => {
    expect(pengaturanOperatorSchema.safeParse(valid).success).toBe(true);
  });

  it("reports each overlong value on its own field, in Bahasa Indonesia", () => {
    const parsed = pengaturanOperatorSchema.safeParse(
      { ...valid, legalName: "x".repeat(201) },
      { error: pesanKesalahan },
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["legalName"]);
    expect(parsed.error.issues[0]?.message).toBe("Paling panjang 200 karakter.");
  });

  it("reports a missing contact number on its own field", () => {
    const parsed = pengaturanOperatorSchema.safeParse({ ...valid, csWhatsApp: "" }, { error: pesanKesalahan });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["csWhatsApp"]);
    expect(parsed.error.issues[0]?.message).toBe("Wajib diisi.");
  });
});
