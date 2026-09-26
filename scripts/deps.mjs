// npm run deps            give this worktree node_modules from the shared store
//                         (runs `npm ci` into the store first if this lockfile is new)
// npm run deps -- --prune remove store entries no worktree's lockfile needs
//
// Replaces `npm ci` in a worktree on the shared host: same lockfile, same npm,
// but the ~1 GB of package files exists once on disk. See AGENTS.md.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkTree, storeKey } from "./lib/deps-store.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const store = process.env.MAKAM_DEPS_STORE ?? path.join(os.homedir(), ".cache", "makam", "deps");

/** @param {string} worktree */
function keyFor(worktree) {
  return storeKey({
    lockfile: readFileSync(path.join(worktree, "package-lock.json"), "utf8"),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });
}

function install() {
  const key = keyFor(root);
  const entry = path.join(store, key);
  if (!existsSync(path.join(entry, "node_modules"))) {
    console.log(`deps: new lockfile, running npm ci into ${entry}`);
    mkdirSync(store, { recursive: true });
    const staging = `${entry}.tmp-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging);
    copyFileSync(path.join(root, "package.json"), path.join(staging, "package.json"));
    copyFileSync(path.join(root, "package-lock.json"), path.join(staging, "package-lock.json"));
    execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: staging, stdio: "inherit" });
    try {
      renameSync(staging, entry);
    } catch {
      // Another worktree finished the same entry first; use theirs.
      rmSync(staging, { recursive: true, force: true });
    }
  }
  try {
    linkTree(path.join(entry, "node_modules"), path.join(root, "node_modules"));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EXDEV") {
      console.error(`deps: the store (${store}) is on another filesystem; set MAKAM_DEPS_STORE to a directory on the worktree's filesystem, or use npm ci.`);
      process.exit(1);
    }
    throw error;
  }
  console.log(`deps: node_modules linked from ${entry}`);
}

function prune() {
  const porcelain = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" });
  const worktrees = porcelain.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length));
  const needed = new Set(worktrees.filter((w) => existsSync(path.join(w, "package-lock.json"))).map(keyFor));
  if (!existsSync(store)) return;
  for (const name of readdirSync(store)) {
    // Entries still being installed (.tmp-<pid>) belong to a running `npm run deps`.
    if (needed.has(name) || name.includes(".tmp-")) continue;
    // Worktrees linked from it keep their files: hard links outlive the store's copy.
    rmSync(path.join(store, name), { recursive: true, force: true });
    console.log(`deps: removed ${name}`);
  }
}

if (process.argv.includes("--prune")) prune();
else install();
