import { describe, expect, it } from "vitest";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { STAF_REASON_MAX, nonaktifkanStafSchema, undangStafSchema } from "./schema";

/** The Staf forms validate with the same schemas their Server Actions use. */
describe("undangStafSchema", () => {
  const valid = { email: "staf@contoh.id", phoneNumber: "081234567890", role: "petugas_lapangan", reason: "" };

  it("accepts an invite with an email, a contact number and one role", () => {
    expect(undangStafSchema.safeParse(valid).success).toBe(true);
  });

  it("lets an empty email through to the domain refusal (email_wajib)", () => {
    expect(undangStafSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
  });

  it("reports an unknown role on its own field, in Bahasa Indonesia", () => {
    const parsed = undangStafSchema.safeParse({ ...valid, role: "pengelola" }, { error: pesanKesalahan });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["role"]);
    expect(parsed.error.issues[0]?.message).toBe("Pilih atau centang bagian ini.");
  });
});

describe("nonaktifkanStafSchema", () => {
  it("accepts an account with a reason", () => {
    expect(nonaktifkanStafSchema.safeParse({ accountId: "akun-1", reason: "Uji coba" }).success).toBe(true);
  });

  it("reports a missing account on its own field, in Bahasa Indonesia", () => {
    const parsed = nonaktifkanStafSchema.safeParse({ accountId: "", reason: "Uji coba" }, { error: pesanKesalahan });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["accountId"]);
    expect(parsed.error.issues[0]?.message).toBe("Wajib diisi.");
  });
});

/** The reason for the Audit Log is the same field in both Staf forms, so it has one length. */
describe("the reason for the Audit Log on a Staf form", () => {
  it("refuses past the one number both forms take, which is also what the inputs stop at", () => {
    for (const schema of [undangStafSchema, nonaktifkanStafSchema]) {
      const atLimit = {
        email: "staf@contoh.id",
        phoneNumber: "081234567890",
        role: "petugas_lapangan",
        accountId: "akun-1",
        reason: "x".repeat(STAF_REASON_MAX),
      };
      expect(schema.safeParse(atLimit).success).toBe(true);

      const parsed = schema.safeParse({ ...atLimit, reason: "x".repeat(STAF_REASON_MAX + 1) }, { error: pesanKesalahan });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["reason"]);
      expect(parsed.error.issues[0]?.message).toBe(`Paling panjang ${STAF_REASON_MAX} karakter.`);
    }
  });
});
