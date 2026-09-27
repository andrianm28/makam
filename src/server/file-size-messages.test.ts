import { describe, expect, it } from "vitest";
import { KTP_CHECK_MAX_BYTES } from "@/domain/identity";
import { palingBesar } from "./file-size-messages";

/** How a refused file's size reads, from the very bytes the check refuses. */
describe("how a file's size limit reads", () => {
  it("says the limit in MB, so the words in a refusal cannot drift from the check", () => {
    expect(palingBesar(KTP_CHECK_MAX_BYTES)).toBe("paling besar 10 MB");
    expect(`Berkas KTP ${palingBesar(KTP_CHECK_MAX_BYTES)}.`).toBe("Berkas KTP paling besar 10 MB.");
  });
});
