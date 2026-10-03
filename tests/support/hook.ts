import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const repoRoot = path.resolve(__dirname, "../..");

export type HookResult = { status: number; stdout: string; stderr: string };

/** Runs a `.claude/hooks/<name>` script the way Claude Code does: JSON on stdin, exit 2 = denied. */
export function runHook(
  name: string,
  input: unknown,
  opts: { cwd?: string; env?: Record<string, string>; path?: string } = {},
): HookResult {
  const r = spawnSync("bash", [path.join(repoRoot, ".claude/hooks", name)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    cwd: opts.cwd ?? repoRoot,
    encoding: "utf8",
    env: {
      PATH: opts.path ?? process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      CLAUDE_PROJECT_DIR: opts.cwd ?? repoRoot,
      ...opts.env,
    },
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

export function tmpDir(prefix: string, track: string[]): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  track.push(d);
  return d;
}

export function cleanup(dirs: string[]): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** A directory of fake executables; each records its argv to `<bin>/<name>.calls` and exits with `exit` (default 0). */
export function fakeBin(dir: string, tools: Record<string, { exit?: number; stdout?: string }>): string {
  mkdirSync(dir, { recursive: true });
  for (const [name, { exit = 0, stdout = "" }] of Object.entries(tools)) {
    const file = path.join(dir, name);
    writeFileSync(
      file,
      `#!/bin/sh\necho "$@" >> "${dir}/${name}.calls"\n${stdout ? `printf '%s' ${JSON.stringify(stdout)}\n` : ""}exit ${exit}\n`,
    );
    chmodSync(file, 0o755);
  }
  return dir;
}
