import { createHash } from "node:crypto";

/**
 * Names derived from a worktree's directory name, so the shared test Postgres
 * and the local Docker stacks never mix one worktree's data with another's.
 */

const POSTGRES_MAX_IDENTIFIER = 63;

function slug(worktree: string, separator: "_" | "-"): string {
  const words = worktree.toLowerCase().match(/[a-z0-9]+/g) ?? ["worktree"];
  return words.join(separator);
}

function fit(name: string, max: number, worktree: string, separator: string): string {
  if (name.length <= max) return name;
  const hash = createHash("sha256").update(worktree).digest("hex").slice(0, 8);
  return `${name.slice(0, max - hash.length - 1)}${separator}${hash}`;
}

/** The test database this worktree owns on the shared test Postgres. */
export function testDatabaseName(worktree: string): string {
  return fit(`makam_test_${slug(worktree, "_")}`, POSTGRES_MAX_IDENTIFIER, worktree, "_");
}

/** The compose project (`docker compose -p`) for this worktree's local stack. */
export function stackProjectName(worktree: string): string {
  return fit(`makam-${slug(worktree, "-")}`, POSTGRES_MAX_IDENTIFIER, worktree, "-");
}

/** Compose projects of the deployed environments on the shared host; cleanup never touches them. */
const DEPLOYED = /^(makam-(staging|prod|nonprod)(-.*)?|glitchtip)$/;

/**
 * The compose projects a worktree's cleanup removes: its own, plus any others
 * found started from its directory (e.g. `makam-v1-dev`), minus deployed ones.
 */
export function stackProjectsToClean(worktree: string, foundInWorktree: readonly string[]): string[] {
  const projects = new Set([stackProjectName(worktree), ...foundInWorktree]);
  return [...projects].filter((project) => !DEPLOYED.test(project));
}
