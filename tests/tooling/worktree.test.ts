import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planStackCleanup, stackProjectName, testDatabaseName, type DockerInventory } from "../../scripts/lib/worktree";

const root = "/home/ubuntu/makam/.claude/worktrees/agent-aba76c5f698c9cee9";

describe("a worktree's test database on the shared test Postgres", () => {
  it("is named after the worktree", () => {
    expect(testDatabaseName(root)).toMatch(/^makam_test_agent_aba76c5f698c9cee9_[0-9a-f]{8}$/);
    expect(testDatabaseName(root)).toBe(testDatabaseName(root));
  });

  it("is a plain lower-case identifier whatever the worktree is called", () => {
    expect(testDatabaseName("/work/Ticket 71: CI/e2e..scan")).toMatch(/^makam_test_e2e_scan_[0-9a-f]{8}$/);
  });

  it("differs for two worktrees with the same directory name in different places", () => {
    expect(testDatabaseName("/a/makam")).not.toBe(testDatabaseName("/b/makam"));
  });

  it("names the same database through a symlink, so tests and clean agree", () => {
    const target = mkdtempSync(path.join(tmpdir(), "makam-real-"));
    const link = path.join(tmpdir(), `makam-link-${process.pid}`);
    symlinkSync(target, link);
    try {
      expect(testDatabaseName(link)).toBe(testDatabaseName(target));
    } finally {
      rmSync(link, { force: true });
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("fits Postgres's 63-byte limit and stays distinct for long worktree names", () => {
    const a = testDatabaseName(`/w/${"very-long-worktree-name-".repeat(4)}one`);
    const b = testDatabaseName(`/w/${"very-long-worktree-name-".repeat(4)}two`);
    expect(a.length).toBeLessThanOrEqual(63);
    expect(b.length).toBeLessThanOrEqual(63);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^makam_test_very_long_worktree_name_[a-z0-9_]+$/);
  });
});

describe("a worktree's local Docker stack", () => {
  it("has a compose project named after the worktree, distinct per worktree path", () => {
    expect(stackProjectName(root)).toMatch(/^makam-agent-aba76c5f698c9cee9-[0-9a-f]{8}$/);
    expect(stackProjectName("/a/makam")).not.toBe(stackProjectName("/b/makam"));
  });

  const mine = stackProjectName(root);
  const empty: DockerInventory = { containers: [], volumes: [], networks: [], images: [] };

  it("is cleaned up whole when its containers were started from the worktree", () => {
    const plan = planStackCleanup(root, {
      containers: [
        { id: "c1", project: mine, workingDir: root },
        { id: "c2", project: mine, workingDir: root },
      ],
      volumes: [{ id: `${mine}_pgdata`, project: mine }],
      networks: [{ id: "n1", project: mine }],
      images: [{ id: `makam-v1:${mine}`, project: mine }],
    });
    expect(plan).toEqual({
      containers: ["c1", "c2"],
      volumes: [`${mine}_pgdata`],
      networks: ["n1"],
      images: [`makam-v1:${mine}`],
      skipped: [],
    });
  });

  it("loses its image after `down -v` too, by the worktree label the image was built with", () => {
    const plan = planStackCleanup(root, {
      ...empty,
      images: [{ id: `makam-v1:${mine}`, project: mine, worktree: root }],
    });
    expect(plan.images).toEqual([`makam-v1:${mine}`]);
  });

  it("leaves an image alone whose tag is not makam-v1:<its project>, label or not", () => {
    const plan = planStackCleanup(root, {
      ...empty,
      containers: [{ id: "c1", project: mine, workingDir: root }],
      images: [
        { id: "postgres:18", project: mine, worktree: root },
        { id: "makam-v1:someone-else", project: mine, worktree: root },
      ],
    });
    expect(plan.containers).toEqual(["c1"]);
    expect(plan.images).toEqual([]);
  });

  it("finds volumes and networks left by `down` without `-v` from the remaining image's project", () => {
    const plan = planStackCleanup(root, {
      containers: [],
      volumes: [{ id: `${mine}_pgdata`, project: mine }],
      networks: [{ id: "n1", project: mine }],
      images: [{ id: `makam-v1:${mine}`, project: mine, worktree: root }],
    });
    expect(plan.volumes).toEqual([`${mine}_pgdata`]);
    expect(plan.networks).toEqual(["n1"]);
    expect(plan.images).toEqual([`makam-v1:${mine}`]);
  });

  it("leaves the shared makam-v1-dev stack alone even when the worktree joined it", () => {
    const plan = planStackCleanup(root, {
      containers: [{ id: "c1", project: "makam-v1-dev", workingDir: root }],
      volumes: [{ id: "makam-v1-dev_pgdata", project: "makam-v1-dev", worktree: root }],
      networks: [{ id: "n1", project: "makam-v1-dev" }],
      images: [{ id: "makam-v1:makam-v1-dev", project: "makam-v1-dev", worktree: root }],
    });
    expect(plan).toEqual({ containers: [], volumes: [], networks: [], images: [], skipped: ["makam-v1-dev"] });
  });

  it("leaves a project alone that is also used from another directory", () => {
    const plan = planStackCleanup(root, {
      containers: [
        { id: "c1", project: "makam-mixed", workingDir: root },
        { id: "c2", project: "makam-mixed", workingDir: "/elsewhere" },
      ],
      volumes: [{ id: "makam-mixed_pgdata", project: "makam-mixed", worktree: root }],
      networks: [{ id: "n1", project: "makam-mixed" }],
      images: [{ id: "makam-v1:makam-mixed", project: "makam-mixed", worktree: root }],
    });
    expect(plan).toEqual({ containers: [], volumes: [], networks: [], images: [], skipped: ["makam-mixed"] });
  });

  it("reaches a container a test here started by hand, which carries no compose project", () => {
    // The database Dump tests start their own Postgres and their own restore
    // containers with `docker run` (tests/tooling/db-backup.test.ts): no compose
    // project, so only the makam.worktree label says whose they are.
    const plan = planStackCleanup(root, {
      ...empty,
      containers: [
        { id: "makam-dbsrc-t64-1", worktree: root },
        { id: "makam-restoretest-staging-1", worktree: root },
        { id: "another-worktrees-source", worktree: "/elsewhere" },
        { id: "unlabelled-wherever-it-came-from" },
      ],
    });
    expect(plan.containers).toEqual(["makam-dbsrc-t64-1", "makam-restoretest-staging-1"]);
  });

  it("never touches deployed environments or anything not proven to come from the worktree", () => {
    const plan = planStackCleanup(root, {
      containers: [
        { id: "s1", project: "makam-staging", workingDir: root },
        { id: "o1", project: mine, workingDir: "/elsewhere" },
      ],
      volumes: [
        { id: "glitchtip_pg", project: "glitchtip", worktree: root },
        { id: "other_pgdata", project: "other" },
        { id: `${mine}_pgdata`, project: mine },
      ],
      networks: [{ id: "n1", project: "makam-nonprod-dev" }],
      images: [{ id: `makam-v1:${mine}`, project: mine }, { id: "postgres:18" }],
    });
    expect(plan.containers).toEqual([]);
    expect(plan.volumes).toEqual([]);
    expect(plan.networks).toEqual([]);
    expect(plan.images).toEqual([]);
  });
});
