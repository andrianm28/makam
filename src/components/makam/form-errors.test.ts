import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pesanKesalahan } from "./form-errors";

/** Inline field errors speak Bahasa Indonesia (docs/design-system.md, voice). */
describe("pesanKesalahan", () => {
  function messageFor(schema: z.ZodType, value: unknown): string | null {
    const parsed = schema.safeParse(value, { error: pesanKesalahan });
    if (parsed.success) return null;
    return parsed.error.issues[0]?.message ?? null;
  }

  it("says a missing value must be filled", () => {
    expect(messageFor(z.string().trim().min(1).max(32), "")).toBe("Wajib diisi.");
    expect(messageFor(z.string().optional(), undefined)).toBeNull();
  });

  it("says a too-long value in characters", () => {
    expect(messageFor(z.string().max(200), "x".repeat(201))).toBe("Paling panjang 200 karakter.");
  });

  it("never leaks an English Zod default", () => {
    const schemas: Array<[z.ZodType, unknown]> = [
      [z.string().trim().min(1).max(32), ""],
      [z.string().max(200), "x".repeat(201)],
      [z.string().trim().min(3).max(254), "ab"],
      [z.string().date(), "bukan-tanggal"],
      [z.literal("ya").optional(), false],
      [z.number(), "teks"],
    ];
    for (const [schema, value] of schemas) {
      const message = messageFor(schema, value);
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/String|Invalid|Required|Expected|Number/i);
    }
  });
});
