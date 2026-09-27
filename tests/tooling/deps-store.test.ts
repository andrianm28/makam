import { mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync, mkdirSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LOCK_TIMEOUT_MS, entriesToPrune, linkTree, lockAlive, sameFilesystem, sealTree, storeKey } from "../../scripts/lib/deps-store.mjs";

const node22 = { nodeVersion: "v22.23.2", platform: "linux", arch: "x64" };

describe("the shared dependency store", () => {
  it("keeps one entry per lockfile, platform and Node major", () => {
    const key = storeKey({ lockfile: '{"lockfileVersion":3}', ...node22 });
    expect(key).toMatch(/^linux-x64-node22-[0-9a-f]{16}$/);
    expect(storeKey({ lockfile: '{"lockfileVersion":3}', ...node22, nodeVersion: "v22.1.0" })).toBe(key);
    expect(storeKey({ lockfile: '{"lockfileVersion":3, "x":1}', ...node22 })).not.toBe(key);
    expect(storeKey({ lockfile: '{"lockfileVersion":3}', ...node22, nodeVersion: "v24.0.0" })).not.toBe(key);
  });
});

describe("linking a worktree's node_modules from the store", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function fixture() {
    root = mkdtempSync(path.join(tmpdir(), "makam-deps-"));
    const store = path.join(root, "store", "node_modules");
    mkdirSync(path.join(store, "pkg", "lib"), { recursive: true });
    mkdirSync(path.join(store, ".bin"));
    writeFileSync(path.join(store, "pkg", "lib", "index.js"), "module.exports = 1;\n");
    writeFileSync(path.join(store, ".package-lock.json"), "{}\n");
    symlinkSync("../pkg/lib/index.js", path.join(store, ".bin", "pkg"));
    return { store, target: path.join(root, "worktree", "node_modules") };
  }

  it("shares the files (hard links) but gives the worktree its own directories", () => {
    const { store, target } = fixture();
    linkTree(store, target);

    const file = path.join("pkg", "lib", "index.js");
    expect(statSync(path.join(target, file)).ino).toBe(statSync(path.join(store, file)).ino);
    expect(statSync(path.join(target, "pkg")).ino).not.toBe(statSync(path.join(store, "pkg")).ino);
    expect(readlinkSync(path.join(target, ".bin", "pkg"))).toBe("../pkg/lib/index.js");
  });

  // As root, the kernel ignores the write-protection bit for the owning user, so the write
  // below would succeed and the assertion would be meaningless: root can always write a
  // read-only file it owns. Skip only in that case, with the reason on the record; this
  // still runs (and must still pass) for any non-root user, cloud sessions included.
  it.skipIf(process.getuid?.() === 0)(
    "makes the store's files read-only, so no worktree can change them in place",
    () => {
      const { store, target } = fixture();
      sealTree(store);
      linkTree(store, target);

      expect(() => writeFileSync(path.join(target, "pkg", "lib", "index.js"), "changed")).toThrow(/EACCES|EPERM/);
      expect(readFileSync(path.join(store, "pkg", "lib", "index.js"), "utf8")).toBe("module.exports = 1;\n");
    },
  );

  it("copies npm's hidden lockfile, which npm rewrites in place, so the store's copy stays intact", () => {
    const { store, target } = fixture();
    sealTree(store);
    linkTree(store, target);

    writeFileSync(path.join(target, ".package-lock.json"), '{"changed":true}\n');
    expect(readFileSync(path.join(store, ".package-lock.json"), "utf8")).toBe("{}\n");
  });

  it("replaces a node_modules the worktree already has", () => {
    const { store, target } = fixture();
    mkdirSync(path.join(target, "stale"), { recursive: true });
    linkTree(store, target);

    expect(() => statSync(path.join(target, "stale"))).toThrow();
    expect(statSync(path.join(target, "pkg", "lib", "index.js")).isFile()).toBe(true);
  });

  it("sees two directories on one filesystem as the same", () => {
    const { store, target } = fixture();
    mkdirSync(target, { recursive: true });
    expect(sameFilesystem(store, target)).toBe(true);
  });

  // /proc is procfs, never the worktree's filesystem: it stands in for a
  // store on another filesystem (MAKAM_DEPS_STORE across a mount).
  it("refuses a store on another filesystem before deleting the worktree's node_modules", () => {
    const { target } = fixture();
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "keep.js"), "mine\n");

    expect(sameFilesystem("/proc", target)).toBe(false);
    try {
      linkTree("/proc", target);
      expect.unreachable("a store on another filesystem must not link");
    } catch (error) {
      // The same contract `npm run deps` branches on: code EXDEV, target untouched.
      expect((error as NodeJS.ErrnoException).code).toBe("EXDEV");
    }
    expect(readFileSync(path.join(target, "keep.js"), "utf8")).toBe("mine\n");
  });
});

describe("the store's install lock", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function lock(owner?: string, ageMs = 0) {
    dir = mkdtempSync(path.join(tmpdir(), "makam-deps-lock-"));
    const lockDir = path.join(dir, "entry.lock");
    mkdirSync(lockDir);
    if (owner !== undefined) writeFileSync(path.join(lockDir, "owner"), owner);
    if (ageMs > 0) {
      const old = new Date(Date.now() - ageMs);
      utimesSync(lockDir, old, old);
    }
    return lockDir;
  }
  const deadPid = () => { throw new Error("ESRCH"); };

  it("treats a lock whose owner file never appeared as alive while fresh, dead past the timeout", () => {
    expect(LOCK_TIMEOUT_MS).toBeGreaterThan(0);
    expect(lockAlive(lock())).toBe(true);
    expect(lockAlive(lock(undefined, LOCK_TIMEOUT_MS + 60_000))).toBe(false);
  });

  it("treats a same-host owner with no such process as dead, a live one as alive", () => {
    expect(lockAlive(lock("some-host:123", 0), { hostname: "some-host", kill: deadPid })).toBe(false);
    expect(lockAlive(lock("some-host:123"), { hostname: "some-host", kill: () => {} })).toBe(true);
  });

  it("trusts a lock owned on another host, whose processes it cannot see", () => {
    expect(lockAlive(lock("other-host:123"), { hostname: "some-host", kill: deadPid })).toBe(true);
  });
});

describe("pruning the shared dependency store", () => {  const worktrees: Record<string, string | undefined> = {
    "/wt/a": "linux-x64-node22-aaaa",
    "/wt/b": "linux-x64-node24-bbbb",
    "/wt/moved-on": "linux-x64-node22-aaaa",
  };
  const linkedKey = (root: string) => worktrees[root];

  it("keeps every entry a worktree still links from, whatever Node major that worktree used", () => {
    const prune = entriesToPrune(
      [
        { name: "linux-x64-node22-aaaa", users: ["/wt/a"], complete: true, installing: false },
        { name: "linux-x64-node24-bbbb", users: ["/wt/b"], complete: true, installing: false },
      ],
      linkedKey,
    );
    expect(prune).toEqual([]);
  });

  it("removes an entry once none of the worktrees that linked it still does", () => {
    const prune = entriesToPrune(
      [{ name: "linux-x64-node22-old", users: ["/wt/moved-on", "/wt/removed"], complete: true, installing: false }],
      linkedKey,
    );
    expect(prune).toEqual(["linux-x64-node22-old"]);
  });

  it("keeps entries with no record of who uses them, and installs still running", () => {
    const prune = entriesToPrune(
      [
        { name: "linux-x64-node22-legacy", users: undefined, complete: true, installing: false },
        { name: "linux-x64-node22-new", users: [], complete: false, installing: true },
      ],
      linkedKey,
    );
    expect(prune).toEqual([]);
  });

  it("removes a crashed install (incomplete, nobody installing)", () => {
    const prune = entriesToPrune(
      [{ name: "linux-x64-node22-crashed", users: [], complete: false, installing: false }],
      linkedKey,
    );
    expect(prune).toEqual(["linux-x64-node22-crashed"]);
  });
});
