import { describe, expect, it } from "vitest";
import { readRuntimeEnv } from "./env";

const DATABASE_URL = "postgres://makam:makam@localhost:5432/makam";

describe("runtime environment", () => {
  it("reads the migrations folder the image sets", () => {
    const env = readRuntimeEnv({ DATABASE_URL, MIGRATIONS_DIR: "/app/drizzle" });
    expect(env.MIGRATIONS_DIR).toBe("/app/drizzle");
  });

  it("leaves the migrations folder unset when empty", () => {
    expect(readRuntimeEnv({ DATABASE_URL, MIGRATIONS_DIR: "" }).MIGRATIONS_DIR).toBeUndefined();
  });
});
