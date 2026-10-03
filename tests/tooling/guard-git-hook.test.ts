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

type Repo = { dir: string; bin: string; bash: (command: string, env?: Record<string, string>) => ReturnType<typeof runHook>; commit: (file: string, body?: string) => void };

/** A clone of a bare origin with `main` pushed, checked out on `branch`; `tools` are fakes put first on PATH. */
function repo(opts: { branch?: string; tools?: Parameters<typeof fakeBin>[1]; bootstrap?: boolean } = {}): Repo {
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
  // Once .claude/main-writers exists on main, only listed sessions may push it; `bootstrap` leaves it out.
  if (!opts.bootstrap) commit(".claude/main-writers", "# nobody yet\n00NOBODY merge\n");
  git(dir, "push", "-q", "origin", "main");
  if (opts.branch) git(dir, "checkout", "-q", "-b", opts.branch);
  const bin = fakeBin(tmpDir("gg-bin-", dirs), { "clean-scanner": {}, ...(opts.tools ?? {}) });
  // Unless a test says otherwise the scan is a stub that finds nothing: Vitest never runs Docker or pulls an image.
  const bash = (command: string, env: Record<string, string> = {}) =>
    runHook("guard-git.sh", { tool_name: "Bash", tool_input: { command }, cwd: dir }, { cwd: dir, env: { MAKAM_GITLEAKS_CMD: `${bin}/clean-scanner`, ...env }, path: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin` });
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
      expect(r.stderr, command).toMatch(/main-writers/);
      expect(r.stderr, command).not.toMatch(/makam-main-writer/); // the self-declared marker is not advertised to a refused session
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
    writeFileSync(path.join(other, "src/a.ts"), "export const code = 1;\n");
    git(other, "add", "-A");
    git(other, "commit", "-q", "-m", "merge thread code");
    git(other, "push", "-q", "origin", "main");
    git(dir, "fetch", "-q", "origin");
    commit("docs/agents/notes.md");
    expect(bash("git push origin main").status).toBe(0);
  });

  it("counts a file moved into docs/ as a change to the place it left", () => {
    const { dir, bash, commit } = repo();
    commit("src/move.ts", "export const m = 1;\n");
    git(dir, "push", "-q", "origin", "main");
    mark(dir, "docs");
    mkdirSync(path.join(dir, "docs"));
    git(dir, "mv", "src/move.ts", "docs/move.ts");
    git(dir, "commit", "-q", "-m", "move");
    const r = bash("git push origin main");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/src\/move\.ts/);
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

describe("guard-git hook, bootstrap of the main-writers list", () => {
  it("allows a push to main with a plain warning while origin/main has no list", () => {
    const { bash } = repo({ bootstrap: true });
    const r = bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01ANYSESSION" });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/bootstrap/i);
    expect(r.stdout + r.stderr).toMatch(/main-writers/);
  });

  it("refuses an unlisted session as soon as the list exists", () => {
    const { bash } = repo();
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01ANYSESSION" }).status).toBe(2);
  });
});

describe("guard-git hook, secrets in outgoing commits", () => {
  const IMAGE = "zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f";
  /** A repo whose scanner is a stub the hook runs instead of Docker (MAKAM_GITLEAKS_CMD), recording the directory it was asked to scan. */
  function withScanner(exit: number) {
    const r = repo({ branch: "ticket-5-x", tools: { scanner: { exit } } });
    const push = (command = "git push -u origin ticket-5-x") => r.bash(command, { MAKAM_GITLEAKS_CMD: `${r.bin}/scanner` });
    return { ...r, push, calls: () => (existsSync(`${r.bin}/scanner.calls`) ? readFileSync(`${r.bin}/scanner.calls`, "utf8") : "") };
  }

  it("blocks the push when the scanner reports a finding, and says how to clear it", () => {
    const { push, calls, dir } = withScanner(1);
    const r = push();
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/gitleaks/);
    expect(r.stderr).toMatch(/\.gitleaks\.toml/);
    expect(calls()).toContain(dir);
  });

  it("lets a clean push through, and scans only pushes", () => {
    const { push, calls, bash } = withScanner(0);
    bash("git status", { MAKAM_GITLEAKS_CMD: "/nonexistent" });
    expect(calls()).toBe("");
    expect(push().status).toBe(0);
    expect(calls()).not.toBe("");
  });

  it("scans with the image CI uses and CI's arguments when no stub is given", () => {
    const { bash, bin } = repo({ branch: "ticket-5-x", tools: { docker: { exit: 0 } } });
    expect(bash("git push -u origin ticket-5-x", { MAKAM_GITLEAKS_CMD: "" }).status).toBe(0);
    const runs = readFileSync(`${bin}/docker.calls`, "utf8").split("\n").filter((l) => l.startsWith("run "));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain(`${IMAGE} git . --config .gitleaks.toml --redact --no-banner`);
  });

  it("says plainly that the commits were not scanned when Docker is unavailable", () => {
    const { bash } = repo({ branch: "ticket-5-x", tools: { docker: { exit: 1 } } });
    const r = bash("git push -u origin ticket-5-x", { MAKAM_GITLEAKS_CMD: "" });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/NOT scanned/);
    expect(r.stdout + r.stderr).toMatch(/Docker/);
  });

  it("treats a scanner that could not run (exit 125) as unavailable, not as a finding", () => {
    const { push } = withScanner(125);
    const r = push();
    expect(r.status).toBe(0);
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

describe("guard-git hook, redirects", () => {
  it("does not take a redirect target for a refspec", () => {
    const { bash } = repo();
    for (const command of ["git push > /tmp/push.log", "git push origin >/tmp/push.log 2>&1", "git push 2> /tmp/e", "git push origin < /dev/null"]) {
      expect(bash(command).status, command).toBe(2);
    }
  });

  it("still lets a ticket branch push with its output redirected", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    expect(bash("git push -u origin ticket-5-x > /tmp/push.log 2>&1").status).toBe(0);
  });
});

describe("guard-git hook, writes through the GitHub API", () => {
  it("refuses gh api writes to refs and contents, which would bypass the push guard", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "gh api -X PATCH repos/andrianm28/makam/git/refs/heads/main -f sha=abc123",
      "gh api repos/andrianm28/makam/contents/README.md -X PUT -f message=m -f content=eA==",
      "gh api --method DELETE repos/andrianm28/makam/git/refs/heads/x",
      "gh api repos/andrianm28/makam/git/refs -f ref=refs/heads/main -f sha=abc123",
      "curl -X PATCH -H 'Authorization: token x' https://api.github.com/repos/andrianm28/makam/git/refs/heads/main -d '{}'",
    ]) {
      const r = bash(command);
      expect(r.status, command).toBe(2);
      expect(r.stderr, command).toMatch(/git push/);
    }
  });

  it("lets refs and contents be read", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "gh api repos/andrianm28/makam/git/refs/heads/main",
      "gh api repos/andrianm28/makam/contents/README.md",
      "curl -s https://api.github.com/repos/andrianm28/makam/contents/README.md",
    ]) {
      expect(bash(command).status, command).toBe(0);
    }
  });
});

describe("guard-git hook, other spellings of a command", () => {
  it("sees git, gh and curl by the name of the program, wherever it lives or however it is wrapped", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "/usr/bin/git push origin main",
      "./git push origin HEAD:main",
      "/usr/local/bin/gh pr create --fill",
      "command git push origin main",
      "env GIT_TRACE=1 git push origin main",
      "sudo -n git push origin main",
      "exec git push origin main",
    ]) {
      expect(bash(command).status, command).toBe(2);
    }
  });

  it("does not take a word that merely follows another command for the program", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of ["echo git push origin main", "echo gh pr create", "grep -r git push src", "git log --grep='git push origin main'"]) {
      expect(bash(command).status, command).toBe(0);
    }
  });
});

describe("guard-git hook, commands inside a command", () => {
  it("looks inside bash -c, sh -c and eval, however deep", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      'bash -c "git push origin main"',
      "sh -c 'git push origin HEAD:main'",
      'bash -lc "git push origin main"',
      'eval "git push origin main"',
      "bash -c \"sh -c 'git push origin main'\"",
      '/bin/zsh -c "gh pr create --fill"',
      'bash -c "git status; git push origin main"',
    ]) {
      expect(bash(command).status, command).toBe(2);
    }
  });

  it("lets harmless commands in a shell string through", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of ['bash -c "git status"', "bash ./scripts/run.sh", 'eval "echo hi"']) {
      expect(bash(command).status, command).toBe(0);
    }
  });
});

describe("guard-git hook, refspec forms that reach main", () => {
  it("refuses a wildcard refspec and the short heads/ spelling", () => {
    const { bash } = repo({ branch: "ticket-5-x" });
    for (const command of [
      "git push origin 'refs/heads/*:refs/heads/*'",
      "git push origin '+refs/heads/*:refs/heads/*'",
      "git push origin HEAD:heads/main",
      "git push origin 'ticket-*:*'",
    ]) {
      expect(bash(command).status, command).toBe(2);
    }
  });
});

describe("guard-git hook, another repository named on the command line", () => {
  it("judges git -C <dir> and --git-dir by that repository, not by the hook's own directory", () => {
    const ticket = repo({ branch: "ticket-5-x" });
    const onMain = repo();
    for (const command of [`git -C ${onMain.dir} push`, `git -C ${onMain.dir} push origin`, `git --git-dir=${onMain.dir}/.git push`, `git --git-dir ${onMain.dir}/.git push`]) {
      expect(ticket.bash(command).status, command).toBe(2);
    }
    for (const command of [`git -C ${ticket.dir} push`, `git -C ${ticket.dir} push origin HEAD`, `git --git-dir=${ticket.dir}/.git push`]) {
      expect(onMain.bash(command).status, command).toBe(0);
    }
  });

  it("composes several -C options the way git does", () => {
    const onMain = repo();
    const ticket = repo({ branch: "ticket-5-x" });
    expect(ticket.bash(`git -C / -C ${onMain.dir} push`).status).toBe(2);
    expect(onMain.bash(`git -C ${path.dirname(ticket.dir)} -C ${path.basename(ticket.dir)} push`).status).toBe(0);
  });
});

describe("guard-git hook, the allowlist of main writers", () => {
  const SID = "cse_01TESTSESSIONID";

  /** Lists `entries` in .claude/main-writers on origin/main, as the coordinator does before it starts the merge thread. */
  function listOnMain(dir: string, entries: string): void {
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude/main-writers"), entries);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "list main writers");
    git(dir, "push", "-q", "origin", "main");
  }

  it("lets a session push to main when its id is listed on origin/main, with no marker", () => {
    const { dir, bash } = repo();
    listOnMain(dir, "# who may push main\n01TESTSESSIONID merge the merge thread\n");
    git(dir, "checkout", "-q", "-b", "merge/batch-1");
    expect(bash("git push origin HEAD:main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(0);
    // the same id under the other prefix the platform uses for a session
    expect(bash("git push origin HEAD:main", { CLAUDE_CODE_REMOTE_SESSION_ID: "session_01TESTSESSIONID" }).status).toBe(0);
  });

  it("refuses a session that is not listed, whatever marker it wrote", () => {
    const { dir, bash } = repo();
    listOnMain(dir, "01SOMEONEELSE merge\n");
    writeFileSync(path.join(dir, ".git/makam-main-writer"), "merge\n");
    const r = bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/main-writers/);
    expect(r.stderr).not.toMatch(/makam-main-writer/);
  });

  it("limits a session listed as docs to docs/ and .scratch/", () => {
    const { dir, bash, commit } = repo();
    listOnMain(dir, "01TESTSESSIONID docs the coordinator\n");
    commit("docs/a.md");
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(0);
    commit("src/a.ts", "code");
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(2);
  });

  it("reads the list from origin/main, not from a file the session edited", () => {
    const { dir, bash } = repo();
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude/main-writers"), "01TESTSESSIONID merge\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "list myself, unpushed");
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(2);
  });

  it("fetches origin/main when the session is not on the list it has, so a merge thread listed a minute ago is let in", () => {
    const { dir, bash } = repo();
    const origin = git(dir, "remote", "get-url", "origin").trim();
    const other = tmpDir("gg-coord-", dirs);
    git(other, "clone", "-q", origin, ".");
    git(other, "config", "user.email", "t@example.com");
    git(other, "config", "user.name", "t");
    listOnMain(other, "01TESTSESSIONID merge\n");
    expect(bash("git push origin HEAD:main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(0);
  });

  it("without a session id falls back to the marker and says that it did", () => {
    const { dir, bash } = repo();
    writeFileSync(path.join(dir, ".git/makam-main-writer"), "merge\n");
    const r = bash("git push origin main");
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/CLAUDE_CODE_REMOTE_SESSION_ID is not set/);
    expect(r.stdout + r.stderr).toMatch(/self-declared/);
  });

  it("lets the coordinator, listed as docs, edit the list itself, and nothing else under .claude/", () => {
    const { dir, bash, commit } = repo();
    listOnMain(dir, "01TESTSESSIONID docs the coordinator\n");
    commit(".claude/main-writers", "01TESTSESSIONID docs the coordinator\n01NEWMERGETHREAD merge\n");
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(0);
    commit(".claude/settings.json", "{}");
    expect(bash("git push origin main", { CLAUDE_CODE_REMOTE_SESSION_ID: SID }).status).toBe(2);
  });
});

