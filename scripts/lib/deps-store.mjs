// The shared dependency store for worktrees on one host: `npm ci` runs once per
// lockfile into ~/.cache/makam/deps/<key>/node_modules, and each worktree gets a
// copy of that tree made of hard links (its own directories, shared file data).
// Plain Node with no dependencies: it runs before a worktree has node_modules.
import { createHash } from "node:crypto";
import { copyFileSync, linkSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
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
 * Recreates `target` as a mirror of `source`: new directories, hard-linked
 * files, identical symlinks. Both must be on the same filesystem.
 * @param {string} source
 * @param {string} target
 */
export function linkTree(source, target) {
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
    else if (COPIED.has(entry.name)) copyFileSync(from, to);
    else linkSync(from, to);
  }
}
