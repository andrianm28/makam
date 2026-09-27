// npm run deps            give this worktree node_modules from the shared store
//                         (runs `npm ci` into the store first if this lockfile is new)
// npm run deps -- --prune remove store entries no worktree links from any more
//
// Replaces `npm ci` in a worktree on the shared host: same lockfile, same npm,
// but the ~1 GB of package files exists once on disk. See AGENTS.md.
//
// Store layout (MAKAM_DEPS_STORE, default ~/.cache/makam/deps):
//   <key>/node_modules   installed by `npm ci` in place, then made read-only
//   <key>/.complete      written once the install finished
//   <key>/users          worktree roots (of any clone) that linked from it
//   <key>.lock/owner     "<host>:<pid>" of the install in progress
// Each worktree records the key it links from in node_modules/.makam-deps.
import { execFileSync } from "node:child_process";
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entriesToPrune, linkTree, lockAlive, sealTree, storeKey } from "./lib/deps-store.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const store = process.env.MAKAM_DEPS_STORE ?? path.join(os.homedir(), ".cache", "makam", "deps");
const MARKER = ".makam-deps";

/** @param {string} file */
function read(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return undefined;
  }
}

/** @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** @param {string} key */
function buildEntry(key) {
  const entry = path.join(store, key);
  const lock = `${entry}.lock`;
  mkdirSync(store, { recursive: true });
  for (;;) {
    if (existsSync(path.join(entry, ".complete"))) return;
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (!lockAlive(lock)) rmSync(lock, { recursive: true, force: true });
      else sleep(2_000); // another worktree is installing the same lockfile
    }
  }
  try {
    writeFileSync(path.join(lock, "owner"), `${os.hostname()}:${process.pid}`);
    if (existsSync(path.join(entry, ".complete"))) return;
    console.log(`deps: new lockfile, running npm ci into ${entry}`);
    // Installed at its final path: build files that record absolute paths stay valid.
    rmSync(entry, { recursive: true, force: true });
    mkdirSync(entry);
    copyFileSync(path.join(root, "package.json"), path.join(entry, "package.json"));
    copyFileSync(path.join(root, "package-lock.json"), path.join(entry, "package-lock.json"));
    execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: entry, stdio: "inherit" });
    sealTree(path.join(entry, "node_modules"));
    writeFileSync(path.join(entry, ".complete"), new Date().toISOString());
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function install() {
  const key = storeKey({
    lockfile: readFileSync(path.join(root, "package-lock.json"), "utf8"),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });
  const entry = path.join(store, key);
  buildEntry(key);
  try {
    linkTree(path.join(entry, "node_modules"), path.join(root, "node_modules"));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EXDEV") {
      console.error(`deps: the store (${store}) is on another filesystem; set MAKAM_DEPS_STORE to a directory on the worktree's filesystem, or use npm ci.`);
      process.exit(1);
    }
    throw error;
  }
  writeFileSync(path.join(root, "node_modules", MARKER), `${key}\n`);
  const users = (read(path.join(entry, "users")) ?? "").split("\n");
  if (!users.includes(root)) appendFileSync(path.join(entry, "users"), `${root}\n`);
  console.log(`deps: node_modules linked from ${entry}`);
}

function prune() {
  if (!existsSync(store)) return;
  const names = readdirSync(store);
  for (const name of names.filter((n) => n.endsWith(".lock"))) {
    if (!lockAlive(path.join(store, name))) rmSync(path.join(store, name), { recursive: true, force: true });
  }
  const entries = names
    .filter((name) => !name.endsWith(".lock"))
    .map((name) => {
      const entry = path.join(store, name);
      const users = read(path.join(entry, "users"));
      return {
        name,
        users: users === undefined ? undefined : users.split("\n").filter(Boolean),
        complete: existsSync(path.join(entry, ".complete")),
        installing: existsSync(`${entry}.lock`) && lockAlive(`${entry}.lock`),
      };
    });
  for (const name of entriesToPrune(entries, (worktree) => read(path.join(worktree, "node_modules", MARKER)))) {
    // Worktrees linked from it keep their files: hard links outlive the store's copy.
    rmSync(path.join(store, name), { recursive: true, force: true });
    console.log(`deps: removed ${name}`);
  }
}

if (process.argv.includes("--prune")) prune();
else install();
