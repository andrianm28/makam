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

describe("guard-git hook, pushes to main", () => {
  it("refuses every push that reaches main, and says how to proceed", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "git push origin main",
      "git push -u origin HEAD:main",
      "git push origin ticket-5-x:refs/heads/main",
      "git push origin +main",
      "git push --force origin HEAD:main",
      "git push origin --all",
      "git push --mirror origin",
      "git push origin --delete main",
      "git push origin :main",
      "git fetch && git push origin main",
    ]) {
      const r = bash(command);
      expect(r.status, command).toBe(2);
      expect(r.stderr, command).toMatch(/main/);
      expect(r.stderr, command).toMatch(/merge thread/);
      expect(r.stderr, command).toMatch(/makam-main-writer/);
    }
  });

  it("refuses a bare push while main is checked out", () => {
    const { bash } = repo();
    expect(bash("git push").status).toBe(2);
    expect(bash("git push origin").status).toBe(2);
  });

  it("lets a ticket branch be pushed", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "git push -u origin ticket-5-x",
      "git push origin HEAD",
      "git push origin ticket-5-x:ticket-5-x",
      "git push",
      "git push origin ticket-5-x:refs/heads/ticket-5-x-fix",
      "git commit -m 'push to main later'",
    ]) {
      expect(bash(command).status, command).toBe(0);
    }
  });
});

describe("guard-git hook, the writers to main", () => {
  const mark = (dir: string, who: string) => writeFileSync(path.join(dir, ".git/makam-main-writer"), `${who}\n`);

  it("lets the merge thread push to main once it has said so", () => {
    const { dir, bash } = repo({ branch: "merge/batch-1" });
    expect(bash("git push origin HEAD:main").status).toBe(2);
    mark(dir, "merge");
    for (const command of ["git push origin HEAD:main", "git push origin main", "git push --force-with-lease origin main"]) {
      expect(bash(command).status, command).toBe(0);
    }
  });

  it("lets the coordinator push only docs and ticket files to main", () => {
    const { dir, bash, commit } = repo();
    mark(dir, "docs");
    commit("docs/agents/notes.md");
    commit(".scratch/makam-v1-build/issues/90-x.md");
    expect(bash("git push origin main").status).toBe(0);
    commit("src/lib/time/jakarta.ts");
    const r = bash("git push origin main");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/src\/lib\/time\/jakarta\.ts/);
    expect(r.stderr).toMatch(/docs/);
  });

  it("judges the coordinator's push by the commits it sends, not by what origin/main gained since", () => {
    const { dir, bash, commit } = repo();
    mark(dir, "docs");
    const origin = git(dir, "remote", "get-url", "origin").trim();
    const other = tmpDir("gg-other-", dirs);
    git(other, "clone", "-q", origin, ".");
    git(other, "config", "user.email", "t@example.com");
    git(other, "config", "user.name", "t");
    mkdirSync(path.join(other, "src"));
    writeFileSync(path.join(other, "src/a.ts"), "x");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "merge thread code");
    git(other, "push", "-q", "origin", "main");
    git(dir, "fetch", "-q", "origin");
    commit("docs/agents/notes.md");
    expect(bash("git push origin main").status).toBe(0);
  });

  it("tells the coordinator to fetch when it has no origin/main to compare with", () => {
    const { dir, bash } = repo();
    mark(dir, "docs");
    git(dir, "update-ref", "-d", "refs/remotes/origin/main");
    const r = bash("git push origin main");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/git fetch origin main/);
  });

  it("ignores a marker it does not know", () => {
    const { dir, bash } = repo({ branch: "ticket-5-x" });
    mark(dir, "please");
    expect(bash("git push origin HEAD:main").status).toBe(2);
  });
});

describe("guard-git hook, secrets in outgoing commits", () => {
  it("scans the commits a push sends and refuses the push on a finding", () => {
    const { bash, bin } = repo({ branch: "ticket-5-x", tools: { gitleaks: { exit: 1 } } });
    const r = bash("git push -u origin ticket-5-x");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/gitleaks/);
    expect(r.stderr).toMatch(/\.gitleaks\.toml/);
    expect(readFileSync(`${bin}/gitleaks.calls`, "utf8")).toContain("origin/main..HEAD");
  });

  it("lets a clean push through, and scans only pushes", () => {
    const { bash, bin } = repo({ branch: "ticket-5-x", tools: { gitleaks: { exit: 0 } } });
    bash("git status");
    expect(existsSync(`${bin}/gitleaks.calls`)).toBe(false);
    expect(bash("git push -u origin ticket-5-x").status).toBe(0);
    expect(existsSync(`${bin}/gitleaks.calls`)).toBe(true);
  });

  it("says plainly that the commits were not scanned when gitleaks is not installed", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    const r = bash("git push -u origin ticket-5-x");
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/gitleaks is not installed/);
    expect(r.stdout + r.stderr).toMatch(/NOT scanned/);
  });
});

describe("guard-git hook, failing closed", () => {
  it("refuses what it cannot read, with a way forward", () => {
    for (const input of ["not json", JSON.stringify({ tool_input: {} })]) {
      const r = runHook("guard-git.sh", input);
      expect(r.status, input).toBe(2);
      expect(r.stderr, input).toMatch(/fail-closed/);
    }
  });

  it("refuses a push it cannot place when the directory is not a git repository", () => {
    const dir = tmpDir("gg-nogit-", dirs);
    const r = runHook("guard-git.sh", { tool_input: { command: "git push origin x" }, cwd: dir }, { cwd: dir });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/fail-closed/);
  });
});

describe("guard-git hook, text that only mentions a command", () => {
  it("does not mistake quoted text or a heredoc body for a command", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      'git commit -m "docs: never run gh pr create, never git push origin main"',
      "echo 'gh api repos/andrianm28/makam/pulls -f title=t'",
      "cat > notes.md <<'EOF'\nrun gh pr create\ngit push origin main\nEOF",
      "cat <<EOF\ngit push origin HEAD:main\nEOF\ngit status",
    ]) {
      expect(bash(command).status, command).toBe(0);
    }
  });

  it("still sees a command after a heredoc or inside a chain", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    expect(bash("cat <<'EOF' > f\nhello\nEOF\ngh pr create --fill").status).toBe(2);
    expect(bash("cd . && FOO=1 gh pr create").status).toBe(2);
  });
});
