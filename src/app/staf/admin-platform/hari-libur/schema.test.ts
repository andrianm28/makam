import { describe, expect, it } from "vitest";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { hapusHariLiburSchema } from "./schema";

/** The Hari Libur remove form validates with the same schema its Server Action uses. */
describe("hapusHariLiburSchema", () => {
  it("accepts a listed date without a reason", () => {
    expect(hapusHariLiburSchema.safeParse({ date: "2026-12-25", reason: "" }).success).toBe(true);
  });

  it("reports a bad date on its own field, in Bahasa Indonesia", () => {
    const parsed = hapusHariLiburSchema.safeParse({ date: "bukan-tanggal", reason: "" }, { error: pesanKesalahan });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(["date"]);
    expect(parsed.error.issues[0]?.message).toBe("Isi tanggal yang benar.");
  });
});
