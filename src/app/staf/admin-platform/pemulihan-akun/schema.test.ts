import { describe, expect, it } from "vitest";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { KTP_CHECK_MAX_BYTES } from "@/domain/identity";
import { palingBesar } from "@/server/file-size-messages";
import { PEMULIHAN_AKUN_REASON_MAX, pulihkanAkunSchema } from "./schema";

function ktpFile(size: number): File {
  return new File([new Uint8Array(size)], "ktp.png", { type: "image/png" });
}

/** The Pemulihan Akun form validates with the same schema its Server Action uses. */
describe("pulihkanAkunSchema", () => {
  const valid = {
    currentEmail: "lama@contoh.id",
    newEmail: "baru@contoh.id",
    ktpCheck: ktpFile(1024),
    ktpChecked: "ya" as const,
    reason: "Email lama tidak bisa dibuka; KTP cocok dengan data Akun",
  };

  it("accepts a complete recovery", () => {
    expect(pulihkanAkunSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses an oversize KTP file on its own field, in Bahasa Indonesia", () => {
    const parsed = pulihkanAkunSchema.safeParse(
      { ...valid, ktpCheck: ktpFile(KTP_CHECK_MAX_BYTES + 1) },
      { error: pesanKesalahan },
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["ktpCheck"]);
    expect(parsed.error.issues[0]?.message).toBe(`Berkas KTP ${palingBesar(KTP_CHECK_MAX_BYTES)}.`);
  });

  it("takes the reason's length from the one number the form's maxLength reads", () => {
    expect(pulihkanAkunSchema.safeParse({ ...valid, reason: "x".repeat(PEMULIHAN_AKUN_REASON_MAX) }).success).toBe(true);
    const parsed = pulihkanAkunSchema.safeParse(
      { ...valid, reason: "x".repeat(PEMULIHAN_AKUN_REASON_MAX + 1) },
      { error: pesanKesalahan },
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["reason"]);
    expect(parsed.error.issues[0]?.message).toBe(`Paling panjang ${PEMULIHAN_AKUN_REASON_MAX} karakter.`);
  });

  it("reports a short new email on its own field", () => {
    const parsed = pulihkanAkunSchema.safeParse({ ...valid, newEmail: "ab" }, { error: pesanKesalahan });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["newEmail"]);
    expect(parsed.error.issues[0]?.message).toBe("Paling pendek 3 karakter.");
  });
});
