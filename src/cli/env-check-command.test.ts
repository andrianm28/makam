import { describe, expect, it } from "vitest";
import { envCheckCommand } from "./env-check-command";

// The production preflight (deploy/bin/makam-preflight) runs this inside the
// image with the host's env file, so "complete for production" is whatever the
// app's own schema says, and the output may be pasted into a chat: names only.
const SECRET = "s3cr3t-value-that-must-never-be-printed-0123456789";

const completeProduction = (): Record<string, string> => ({
  APP_ENV: "production",
  DATABASE_URL: `postgresql://makam:${SECRET}@postgres:5432/makam`,
  AUTH_SECRET: SECRET + SECRET,
  APP_BASE_URL: "https://makam.co.id",
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  VAPID_PUBLIC_KEY: "BNbxGYNMhEIi9zrneh7mqV4oUanjLUK3m-mzQTyE9Oy9w_lZmWjkiB_GzOvbJmoGuAnrBhVMZTeHkU9YyDR5jlE",
  VAPID_PRIVATE_KEY: "Dt1CLgQlkiaA-tmCkATyKZeoF1-Gtw1-gdEuWrspXhA",
  VAPID_SUBJECT: "mailto:ops@makam.co.id",
  SENTRY_DSN: "https://key@errors.makam.co.id/1",
  SMTP_USER: "user",
  SMTP_PASSWORD: SECRET,
  EMAIL_FROM: "no-reply@makam.co.id",
  SUMOPOD_API_KEY: SECRET,
  SUMOPOD_WEBHOOK_SECRET: "whsec_abc123",
});

describe("env-check: is this environment complete for production?", () => {
  it("accepts a complete production environment and says so without printing a value", async () => {
    const result = await envCheckCommand(["production"], completeProduction());

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/production/);
    expect(result.output).not.toContain(SECRET);
  });

  it("names every missing variable and never a value", async () => {
    const env = completeProduction();
    delete env.SUMOPOD_API_KEY;
    delete env.TOTP_ENCRYPTION_KEY;

    const result = await envCheckCommand(["production"], env);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("SUMOPOD_API_KEY");
    expect(result.output).toContain("TOTP_ENCRYPTION_KEY");
    expect(result.output).not.toContain(SECRET);
  });

  it("refuses an environment that is not the one asked for, so a staging file cannot pass as production", async () => {
    const result = await envCheckCommand(["production"], { ...completeProduction(), APP_ENV: "staging" });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("APP_ENV");
  });
});
