import { execFileSync } from "node:child_process";

/*
 * The example Tagihan the payment path and the Admin Platform detail open,
 * issued by the real dev-only seed command inside the web container. One
 * Tagihan per call: the seed refuses staging and production, so it only ever
 * produces data on the stack under test. Override the command with
 * E2E_SEED_TAGIHAN, like E2E_SEED_ADMIN, e.g.
 * "docker compose -p <stack> exec -T web node dist/seed-tagihan.mjs".
 */
const SEED_TAGIHAN = (process.env.E2E_SEED_TAGIHAN ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-tagihan.mjs").split(" ");

/** Issues an example Tagihan and returns its Nomor Tagihan and its public document page. */
export function seedTagihan(): { nomorTagihan: string; path: string } {
  const [command, ...args] = SEED_TAGIHAN;
  const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const seeded = /Tagihan contoh (TGH\/\d{4}\/\d{6}) terbit: (\/dokumen\/[A-Za-z0-9_-]{43})/.exec(output);
  if (!seeded) throw new Error(`seed-tagihan did not issue a Tagihan: ${output}`);
  return { nomorTagihan: seeded[1], path: seeded[2] };
}
