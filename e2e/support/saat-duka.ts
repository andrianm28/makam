import { execFileSync } from "node:child_process";

/*
 * The one Lokasi Mitra the Saat Duka wizard can offer, seeded once per stack by
 * the real dev-only seed command. It refuses when the stack already lists a
 * Lokasi Mitra, so it never fights another spec's data. The seed runs inside the
 * web container; override with E2E_SEED_SAAT_DUKA, e.g.
 * E2E_SEED_SAAT_DUKA="npx tsx src/cli/seed-saat-duka.ts" against a local dev server.
 */
const SEED = (process.env.E2E_SEED_SAAT_DUKA ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-saat-duka.mjs").split(" ");

const refuses = "hanya untuk development dan test";
const noAdmin = "belum ada Admin Platform";

/**
 * Seeds the example Lokasi Mitra, and returns the page path of it. Throws when
 * the seed could not run at all (the spec then fails loudly rather than walking
 * an empty list).
 */
export function seedSaatDukaLokasi(): string {
  const [command, ...args] = SEED;
  let output: string;
  try {
    output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    if (output.includes(refuses) || output.includes(noAdmin)) return "";
    throw new Error(`seed-saat-duka failed: ${output}`);
  }
  const terbit = /\/lokasi\/([0-9a-f-]{36})/.exec(output);
  if (!terbit) return "";
  return `/lokasi/${terbit[1]}`;
}

/** A 1×1 PNG, the smallest real image the family upload accepts. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** Attaches every document the seeded Lokasi Mitra asks for on "Data & kirim" (its default checklist), before Kirim. */
export async function lampirkanDokumen(page: import("@playwright/test").Page): Promise<void> {
  for (const nama of ["KTP Almarhum", "Kartu Keluarga", "KTP Pemesan"]) {
    await page.getByLabel(nama).setInputFiles({ name: `${nama}.png`, mimeType: "image/png", buffer: PNG_1X1 });
  }
}
