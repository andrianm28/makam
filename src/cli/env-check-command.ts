import { readRuntimeEnv } from "@/lib/env";

/** The variable names a failed parse complains about; zod's text never carries the value, and only names are kept anyway. */
function failingNames(error: unknown): string[] {
  const message = error instanceof Error ? error.message : "";
  const names = [...message.matchAll(/→ at ([A-Za-z0-9_]+)/g)].map((match) => match[1]!);
  return [...new Set(names)];
}

/**
 * `env-check <APP_ENV>`: is the environment this process was started with
 * complete and valid for that APP_ENV, by the app's own schema? Run inside the
 * image by deploy/bin/makam-preflight. Prints variable names only, never values.
 */
export async function envCheckCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  const [expected] = argv;
  if (argv.length !== 1 || !expected) return { exitCode: 2, output: "Pakai: env-check <APP_ENV>" };
  try {
    readRuntimeEnv(source);
  } catch (error) {
    return { exitCode: 1, output: `environment is not valid for ${expected}; check: ${failingNames(error).join(", ")}` };
  }
  return { exitCode: 0, output: `environment is complete for ${expected}` };
}
