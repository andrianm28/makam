import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Runs the docker CLI and returns its trimmed stdout; throws with its stderr on failure. */
export async function docker(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  try {
    const { stdout } = await run("docker", args, { ...options, maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(`docker ${args[0]} failed: ${stderr || String(error)}`, { cause: error });
  }
}

/** True when `docker inspect` failed because the object does not exist (not because the daemon is down). */
export function isNoSuchObject(error: unknown): boolean {
  return /no such (object|container)/i.test(String(error));
}

/** True when docker failed because its daemon is not reachable (down, or not permitted), not because an object is missing. */
export function isDaemonDown(error: unknown): boolean {
  return /cannot connect to the docker daemon|is the docker daemon running|permission denied.*docker daemon|no such file or directory.*docker\.sock/i.test(
    String(error),
  );
}

export type RemovalResult = {
  removed: string[];
  failed: { id: string; error: unknown }[];
};

/** Removes each id in turn, keeping going past failures so one stuck object never hides the rest. */
export async function removeEach(
  ids: string[],
  remove: (id: string) => Promise<unknown>,
): Promise<RemovalResult> {
  const removed: string[] = [];
  const failed: { id: string; error: unknown }[] = [];
  for (const id of ids) {
    try {
      await remove(id);
      removed.push(id);
    } catch (error) {
      failed.push({ id, error });
    }
  }
  return { removed, failed };
}

/** Non-empty output lines. */
export function lines(output: string): string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}
