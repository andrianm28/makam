import { describe, expect, it } from "vitest";
import { stackProjectName, stackProjectsToClean, testDatabaseName } from "../support/worktree";

describe("a worktree's test database on the shared test Postgres", () => {
  it("is named after the worktree", () => {
    expect(testDatabaseName("agent-aba76c5f698c9cee9")).toBe("makam_test_agent_aba76c5f698c9cee9");
  });

  it("is a plain lower-case identifier whatever the worktree is called", () => {
    expect(testDatabaseName("Ticket 71: CI/e2e..scan")).toBe("makam_test_ticket_71_ci_e2e_scan");
  });

  it("fits Postgres's 63-byte limit and stays distinct for long worktree names", () => {
    const a = testDatabaseName(`${"very-long-worktree-name-".repeat(4)}one`);
    const b = testDatabaseName(`${"very-long-worktree-name-".repeat(4)}two`);
    expect(a.length).toBeLessThanOrEqual(63);
    expect(b.length).toBeLessThanOrEqual(63);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^makam_test_very_long_worktree_name_[a-z0-9_]+$/);
  });
});

describe("a worktree's local Docker stack", () => {
  it("has a compose project named after the worktree", () => {
    expect(stackProjectName("agent-aba76c5f698c9cee9")).toBe("makam-agent-aba76c5f698c9cee9");
    expect(stackProjectName("Ticket 71: CI/e2e")).toBe("makam-ticket-71-ci-e2e");
  });

  it("is cleaned up together with any other stack started from the worktree, never a deployed one", () => {
    const found = ["makam-v1-dev", "makam-agent-x", "makam-staging", "makam-prod", "glitchtip", "makam-nonprod-dev"];
    expect(stackProjectsToClean("agent-x", found).sort()).toEqual(["makam-agent-x", "makam-v1-dev"]);
  });
});
