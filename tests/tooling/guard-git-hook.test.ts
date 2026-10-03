import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fakeBin, runHook, tmpDir } from "../support/hook";

const dirs: string[] = [];
afterEach(() => cleanup(dirs));

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

type Repo = { dir: string; bin: string; bash: (command: string) => ReturnType<typeof runHook>; commit: (file: string, body?: string) => void };

/** A clone of a bare origin with `main` pushed, checked out on `branch`; `tools` are fakes put first on PATH. */
function repo(opts: { branch?: string; tools?: Parameters<typeof fakeBin>[1] } = {}): Repo {
  const origin = tmpDir("gg-origin-", dirs);
  git(origin, "init", "-q", "--bare", "-b", "main");
  const dir = tmpDir("gg-clone-", dirs);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "remote", "add", "origin", origin);
  const commit = (file: string, body = "x") => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), body);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `add ${file}`);
  };
  commit("README.md");
  git(dir, "push", "-q", "origin", "main");
  if (opts.branch) git(dir, "checkout", "-q", "-b", opts.branch);
  const bin = fakeBin(tmpDir("gg-bin-", dirs), opts.tools ?? {});
  const bash = (command: string) =>
    runHook("guard-git.sh", { tool_name: "Bash", tool_input: { command }, cwd: dir }, { cwd: dir, path: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin` });
  return { dir, bin, bash, commit };
}

describe("guard-git hook, pull requests", () => {
  it("refuses creating a pull request, by gh or by the REST API, and says what to do instead", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "gh pr create --draft --title t --body b",
      "git push -u origin ticket-5-x && gh pr create --fill",
      "gh api repos/andrianm28/makam/pulls -f title=t -f head=ticket-5-x -f base=main",
      "gh api -X POST /repos/andrianm28/makam/pulls",
      "curl -X POST -H 'Authorization: token x' https://api.github.com/repos/andrianm28/makam/pulls -d '{}'",
    ]) {
      const r = bash(command);
      expect(r.status, command).toBe(2);
      expect(r.stderr, command).toMatch(/pull request/i);
      expect(r.stderr, command).toMatch(/AGENTS\.md/);
    }
  });

  it("lets pull requests be read", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of ["gh pr view 3", "gh pr list", "gh api repos/andrianm28/makam/pulls/3", "git status"]) {
      expect(bash(command).status, command).toBe(0);
    }
  });
});
