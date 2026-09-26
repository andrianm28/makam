import { execFileSync } from "node:child_process";

/*
 * The first Admin Platform of the stack under test. The real seed CLI refuses
 * once an Admin Platform exists, so e2e seeds one known email and, when the
 * stack already has it, reuses it. The seed runs inside the web container;
 * override with E2E_SEED_ADMIN, e.g. E2E_SEED_ADMIN="npx tsx src/cli/seed-admin.ts"
 * against a local dev server, or "docker compose -p <stack> exec -T web node dist/seed-admin.mjs".
 */
const SEED_ADMIN = (process.env.E2E_SEED_ADMIN ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-admin.mjs").split(" ");

/** The e2e Admin Platform: one known email (its Email Terverifikasi) per stack. */
export const e2eAdminPlatform = "admin-e2e@makam.co.id";
const e2eAdminPlatformPhone = "081100000001";

const created = `Admin Platform pertama dibuat: ${e2eAdminPlatform}`;
const alreadySeeded = "sudah ada Admin Platform";

/**
 * Seeds the e2e Admin Platform unless the stack already has an Admin Platform,
 * and returns its email. `fresh` is false when it was already there (it may
 * then have enrolled TOTP in an earlier run).
 */
export function seedE2eAdminPlatform(): { email: string; fresh: boolean } {
  const [command, ...args] = SEED_ADMIN;
  let output: string;
  try {
    output = execFileSync(command, [...args, "--email", e2eAdminPlatform, "--phone", e2eAdminPlatformPhone], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    if (output.includes(alreadySeeded)) return { email: e2eAdminPlatform, fresh: false };
    throw new Error(`seed:admin failed: ${output}`);
  }
  if (!output.includes(created)) throw new Error(`seed:admin did not create ${e2eAdminPlatform}: ${output}`);
  return { email: e2eAdminPlatform, fresh: true };
}
