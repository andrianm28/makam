import { describe, expect, it } from "vitest";
import { formatTelepon } from "./format-telepon";

describe("a phone number as a family reads it", () => {
  it("uses the local 0 and groups of four", () => {
    expect(formatTelepon("+6281122223333")).toBe("0811-2222-3333");
    expect(formatTelepon("+62811222333")).toBe("0811-2223-33");
  });

  it("leaves a number that is not Indonesian as stored", () => {
    expect(formatTelepon("+6591234567")).toBe("+6591234567");
  });
});
