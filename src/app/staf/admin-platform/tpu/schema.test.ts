import { describe, expect, it } from "vitest";
import { TPU_LIMITS } from "@/domain/lokasi";
import { newTpuFormSchema, tpuProfileFormSchema, tpuStatusEditSchema } from "./schema";

/**
 * The shapes the TPU forms and their Server Actions share live in one module,
 * so a field's length and its rule are written once (`schema.ts`).
 */
const profile = {
  name: "TPU Kober",
  address: "Jl. TPU No. 1, Jakarta Timur",
  city: "Kota Jakarta Timur",
  dataSource: "Dinas Pengguna Umum dan Prasarana",
  pinLat: "",
  pinLng: "",
};

/** The field of `input` the schema refuses, or null when it is valid. */
const refusedField = (schema: { safeParse: (input: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[] }[] } } }, input: unknown) => {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : (parsed.error?.issues[0]?.path.join(".") ?? "unknown");
};

describe("the TPU profile both the form and its Server Action hold", () => {
  it("takes a name, an address, a city, a data source and no pin at all", () => {
    expect(refusedField(tpuProfileFormSchema, profile)).toBeNull();
    expect(refusedField(tpuProfileFormSchema, { ...profile, pinLat: "-6,2", pinLng: "106,9" })).toBeNull();
  });

  it.each([
    ["a blank name", { name: "  " }, "name"],
    ["a name past its length", { name: "x".repeat(TPU_LIMITS.name + 1) }, "name"],
    ["a blank address", { address: "" }, "address"],
    ["a blank city", { city: "  " }, "city"],
    ["a blank data source", { dataSource: "" }, "dataSource"],
    ["a latitude that is not a number", { pinLat: "enam" }, "pinLat"],
    ["a longitude that is not a number", { pinLng: "seratus" }, "pinLng"],
  ])("refuses %s, naming the field", (_case, override, field) => {
    expect(refusedField(tpuProfileFormSchema, { ...profile, ...override })).toBe(field);
  });

  it("keeps the decimal comma a person types, and refuses only what is no number", () => {
    expect(tpuProfileFormSchema.parse({ ...profile, pinLat: "-6,2", pinLng: "106,9" })).toMatchObject({
      pinLat: "-6,2",
      pinLng: "106,9",
    });
  });
});

describe("the TPU status the forms and their Server Actions hold", () => {
  it("is a whole TPU with a new-plot choice, and nothing else", () => {
    const tpuId = "7d1c5a52-5f3e-4b8e-9a51-2d8c1f0e9b11";
    expect(refusedField(newTpuFormSchema, { ...profile, menerimaMakamBaru: "ya" })).toBeNull();
    expect(refusedField(newTpuFormSchema, { ...profile, menerimaMakamBaru: "mungkin" })).toBe("menerimaMakamBaru");
    expect(refusedField(tpuStatusEditSchema, { tpuId, menerimaMakamBaru: "tidak", nama: "TPU Kober" })).toBeNull();
    expect(refusedField(tpuStatusEditSchema, { tpuId: "bukan-uuid", menerimaMakamBaru: "ya", nama: "TPU Kober" })).toBe("tpuId");
  });
});
