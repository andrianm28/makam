// The shared dependency store for worktrees on one host: `npm ci` runs once per
// lockfile into ~/.cache/makam/deps/<key>/node_modules, and each worktree gets a
// copy of that tree made of hard links (its own directories, shared file data).
// Plain Node with no dependencies: it runs before a worktree has node_modules.
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Files npm rewrites in place; the worktree gets its own copy instead of a link. */
const COPIED = new Set([".package-lock.json"]);

/**
 * The store entry for a lockfile. Native binaries depend on the platform and
 * the Node ABI, so those are part of the key.
 * @param {{ lockfile: string, nodeVersion: string, platform: string, arch: string }} input
 * @returns {string}
 */
export function storeKey({ lockfile, nodeVersion, platform, arch }) {
  const major = nodeVersion.replace(/^v/, "").split(".")[0];
  const hash = createHash("sha256").update(lockfile).digest("hex").slice(0, 16);
  return `${platform}-${arch}-node${major}-${hash}`;
}

/**
 * How long a lock without an owner file counts as still being born: the gap
 * between `mkdir` and writing `owner` is milliseconds, so anything older
 * crashed in between and never will finish.
 */
export const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * True when the store entry's install lock is held by a live installer.
 * A lock whose owner file never appeared (crash between mkdir and write)
 * counts as alive only while fresh; past the timeout it is dead, so both
 * `install` and `prune` clear it. A lock owned on another host counts as
 * alive: its processes cannot be seen from here.
 * @param {string} lock the `<entry>.lock` directory
 * @param {{ now?: number, hostname?: string, kill?: (pid: number) => void }} [options]
 * @returns {boolean}
 */
export function lockAlive(lock, { now = Date.now(), hostname = os.hostname(), kill = (pid) => process.kill(pid, 0) } = {}) {
  let owner;
  try {
    owner = readFileSync(path.join(lock, "owner"), "utf8").trim();
  } catch {
    owner = undefined;
  }
  if (!owner) {
    let ageMs;
    try {
      ageMs = now - statSync(lock).mtimeMs;
    } catch {
      return false;
    }
    return ageMs < LOCK_TIMEOUT_MS;
  }
  const [host, pid] = owner.split(":");
  if (host !== hostname) return true;
  try {
    kill(Number(pid));
    return true;
  } catch {
    return false;
  }
}

/**
 * True when hard links work from `source` to `target`: both on the same
 * filesystem. Compares `source` against the nearest existing ancestor of
 * `target`, so it also answers for a `target` that is not there yet.
 * @param {string} source
 * @param {string} target
 * @returns {boolean}
 */
export function sameFilesystem(source, target) {
  const from = statSync(source).dev;
  let dir = target;
  while (!existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return statSync(dir).dev === from;
}

/**
 * Recreates `target` as a mirror of `source`: new directories, hard-linked
 * files, identical symlinks. Both must be on the same filesystem: a store on
 * another filesystem throws EXDEV before `target` is touched, so the
 * worktree keeps its existing node_modules.
 * @param {string} source
 * @param {string} target
 */
export function linkTree(source, target) {
  if (!sameFilesystem(source, target)) {
    const error = new Error(`cannot hard-link ${target} from ${source}: another filesystem`);
    error.code = "EXDEV";
    throw error;
  }
  rmSync(target, { recursive: true, force: true });
  mirror(source, target);
}

/** @param {string} source @param {string} target */
function mirror(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) mirror(from, to);
    else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else if (COPIED.has(entry.name)) {
      copyFileSync(from, to);
      chmodSync(to, lstatSync(from).mode | 0o200);
    } else linkSync(from, to);
  }
}

/**
 * Makes every regular file under `dir` read-only (a-w), so a tool that tries
 * to change a shared file in place fails loudly instead of changing it for
 * every worktree. Directories stay writable, so entries can still be removed.
 * @param {string} dir
 */
export function sealTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sealTree(full);
    else if (entry.isFile()) chmodSync(full, lstatSync(full).mode & ~0o222);
  }
}

/**
 * @typedef {{ name: string, users: string[] | undefined, complete: boolean, installing: boolean }} StoreEntry
 */

/**
 * The store entries `npm run deps -- --prune` removes: finished entries none
 * of whose recorded users (worktree roots, from any clone) still links from
 * them, and crashed installs. Entries with no user record are kept.
 * @param {StoreEntry[]} entries
 * @param {(root: string) => string | undefined} linkedKey the entry a worktree links from now
 * @returns {string[]}
 */
export function entriesToPrune(entries, linkedKey) {
  return entries
    .filter((entry) => {
      if (entry.installing) return false;
      if (!entry.complete) return true;
      if (entry.users === undefined) return false;
      return !entry.users.some((root) => linkedKey(root) === entry.name);
    })
    .map((entry) => entry.name);
}
