import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// `deploy/install-host.sh` runs against the host from inside somebody's
// checkout, and one of its own guard steps is `git status` — which refreshes
// .git/index and writes it back. Run under sudo, that write lands as root, and
// every later git command by the person who owns the checkout fails with
// "fatal: .git/index: index file open failed: Permission denied". Measured on
// the host: .git/index was the only file in the tree not owned by ubuntu, and
// `sudo chown ubuntu:ubuntu .git/index` restored everything. The script now
// points GIT_INDEX_FILE at a throwaway copy for every git call it makes; this
// is the guard that says it still does, and that the copy has not quietly been
// removed together with the dirty-tree refusal it protects.
//
// The rule is deliberately about *the index git may write*, not about the word
// "status": a plain `git status` is only the cheapest way to reach it, and
// `git add`, `git read-tree`, `git checkout` and the rest reach the same file.
// So the sweep below flags any of them that runs before the scratch index is
// in place, and separately flags anything that writes the real index by
// another route.
const SCRIPT_URL = new URL("../../deploy/install-host.sh", import.meta.url);
const script = readFileSync(SCRIPT_URL, "utf8");

/**
 * The git subcommands that open the index for writing. `rev-parse`, `log` and
 * `cat-file` are absent on purpose: they read refs, the config and objects,
 * never the index, so the one that asks git where the index is may run before
 * the scratch one exists.
 */
const INDEX_WRITING = [
  "add",
  "am",
  "apply",
  "checkout",
  "cherry-pick",
  "commit",
  "diff",
  "merge",
  "mv",
  "pull",
  "read-tree",
  "rebase",
  "reset",
  "restore",
  "rm",
  "sparse-checkout",
  "stash",
  "status",
  "switch",
  "update-index",
  "write-tree",
];

/** `git -C "$REPO" status`: the global options, then the subcommand. */
const GIT_CALL = /\bgit\s+(?:-[A-Za-z-]+(?:\s+\S+)?\s+)*([a-z][a-z-]*)/g;

/** Commands that put something at the path they are last given. */
const DESTINATIONS = /\b(cp|install|mv|tee|truncate|ln)\b/;
const IN_PLACE = /\b(rm|touch|chmod|chown|truncate)\b/;

/** Comments run nothing. `#` starts one at a word boundary in shell. */
function codeOnly(text: string): string {
  return text.replace(/(^|\s)#[^\n]*/g, "$1");
}

/** The path a writing command would write to: the line up to its first `|`, `;` or `{`. */
function destination(line: string): string {
  return line
    .slice(0, line.search(/[|;{]/))
    .trim()
    .split(/\s+/)
    .pop()!;
}

/** Every way this script could write the caller's .git/index, as `<line>: <text>`. */
function indexWrites(text: string): string[] {
  const lines = codeOnly(text).split("\n");
  // The line the scratch index is in place from: everything above it ran with
  // the caller's index, which is the whole of the bug.
  const guardedFrom = lines.findIndex((line) => /^\s*export\s+GIT_INDEX_FILE=/.test(line));
  const guarded = guardedFrom === -1 ? Number.POSITIVE_INFINITY : guardedFrom + 1;

  const found: string[] = [];
  lines.forEach((line, index) => {
    const at = index + 1;
    for (const call of line.matchAll(GIT_CALL)) {
      const subcommand = call[1]!;
      if (INDEX_WRITING.includes(subcommand) && at < guarded) {
        found.push(`${at}: git ${subcommand} runs before the scratch index is in place`);
      }
    }
    // A second route to the same file: anything writing a path called `index`.
    // `cp "$git_dir/index" "$GIT_INDEX_FILE"` is the one allowed shape — the
    // real index as the source of a read, never as the destination.
    if (DESTINATIONS.test(line) && /\bindex\b/.test(destination(line))) {
      found.push(`${at}: ${line.trim()} writes a path called index`);
    }
    if (IN_PLACE.test(line) && /\bindex\b/.test(line)) {
      found.push(`${at}: ${line.trim()} changes a path called index in place`);
    }
    if (/\bunset\s+GIT_INDEX_FILE/.test(line)) {
      found.push(`${at}: GIT_INDEX_FILE is unset, so the git calls after it use the caller's index`);
    }
  });
  return found;
}

describe("install-host.sh and the caller's .git/index", () => {
  it("never runs a git command that can write the caller's index", () => {
    // This is the finding the bug report is: the script's own guard step was
    // the thing that broke the tree, because `git status` rewrites the index
    // it is asked to report on.
    expect(indexWrites(script)).toEqual([]);
  });

  it("would flag a plain `git status` on the caller's tree, so the rule is not vacuous", () => {
    // A guard nobody has seen fail is a guess. The rule has to catch the shape
    // that actually broke the host, in the file it actually broke it in — and
    // so it has to go red on this script the moment the scratch index is gone.
    const planted = `#!/usr/bin/env bash
set -euo pipefail
REPO=/home/ubuntu/makam
git_dir=$(git -C "$REPO" rev-parse --absolute-git-dir)
[ -z "$(git -C "$REPO" status --porcelain)" ] || exit 1
`;
    expect(indexWrites(planted)).toEqual(["5: git status runs before the scratch index is in place"]);

    const withoutScratch = script.replace(/^export GIT_INDEX_FILE=.*$/m, "GIT_INDEX_FILE=");
    expect(withoutScratch, "the script no longer exports GIT_INDEX_FILE, so this test proves nothing").not.toBe(script);
    expect(indexWrites(withoutScratch)).toEqual(["72: git status runs before the scratch index is in place"]);
  });

  it("catches the same file reached by every other command that writes an index", () => {
    const planted = INDEX_WRITING.map((subcommand) => `git -C "$REPO" ${subcommand}`).join("\n");
    expect(indexWrites(planted)).toHaveLength(INDEX_WRITING.length);
    // And by the other routes to that file that are not git at all.
    for (const planted of ['cp new "$git_dir/index"', 'rm -f "$git_dir/index"', 'chmod 644 .git/index', "unset GIT_INDEX_FILE\n"]) {
      expect(indexWrites(planted).length, planted).toBeGreaterThan(0);
    }
  });

  it("leaves alone a scratch index it set up, and a read of the real one", () => {
    const allowed = [
      'git_dir=$(git -C "$REPO" rev-parse --absolute-git-dir)',
      "scratch=$(mktemp -d)",
      "trap 'rm -rf \"$scratch\"' EXIT",
      'export GIT_INDEX_FILE="$scratch/index"',
      'cp "$git_dir/index" "$GIT_INDEX_FILE"',
      'git -C "$REPO" rev-parse --abbrev-ref HEAD',
      'git -C "$REPO" rev-parse --short HEAD',
      '[ -z "$(git -C "$REPO" status --porcelain)" ] || { echo "refusing" >&2; exit 1; }',
    ].join("\n");
    expect(indexWrites(allowed)).toEqual([]);
  });

  it("puts the scratch index in a temporary directory, and throws it away", () => {
    // A scratch index inside $REPO would still be a new file in the caller's
    // tree, and one nothing cleans up if the run is interrupted.
    const scratch = script.match(/^scratch=\$\(mktemp -d\)$/m);
    expect(scratch, "the scratch directory is not an mktemp -d").not.toBeNull();
    expect(script).toMatch(/^trap 'rm -rf "\$scratch"' EXIT$/m);
    expect(script).toMatch(/^export GIT_INDEX_FILE="\$scratch\/index"$/m);
  });

  it("still refuses a branch that is not main", () => {
    // The scratch index is not a licence to read less. Both refusals are the
    // script's real work: installing host tooling from an unmerged branch, or
    // from a tree nobody has committed, is how a host ends up running code
    // that is not on main.
    expect(script).toMatch(/git -C "\$REPO" rev-parse --abbrev-ref HEAD/);
    expect(script).toMatch(/\[ "\$branch" = main \] \|\| \{[^}]*exit 1;/);
  });

  it("still refuses a dirty tree, and only --allow-branch waves it through", () => {
    expect(script).toMatch(/\[ -z "\$\(git -C "\$REPO" status --porcelain\)" \] \|\| \{[^}]*exit 1;/);
    expect(script).toMatch(/^  --allow-branch\) ALLOW_BRANCH=1 ;;$/m);
  });
});

// The static guard above proves the shape. These run it, on a throwaway
// repository in a temporary directory: the script's own two blocks are cut out
// of the file and executed, because the failure this fixes is a file *write*
// and whether a file is written is not a thing a grep can answer. The blocks are
// the scratch index and the two refusals, so a run either refuses or gets
// through them, and never reaches the writes to /opt and /etc that the real
// script goes on to do.
describe("install-host.sh's own guard, run on a throwaway repository", () => {
  const lines = script.split("\n");

  /** The block of shell from the line matching `from` to the first `fi` after it. */
  function block(from: RegExp, what: string): string {
    const start = lines.findIndex((line) => from.test(line));
    expect(start, `${what} is gone from the script, so this test proves nothing`).toBeGreaterThan(-1);
    const end = lines.indexOf("fi", start);
    expect(end, `${what} has no closing fi`).toBeGreaterThan(start);
    return lines.slice(start, end + 1).join("\n");
  }

  let dir: string;
  let repo: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "makam-install-host-"));
    repo = path.join(dir, "checkout");
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git("init", "--quiet", "--initial-branch=main", ".");
    git("config", "user.email", "tooling@example.invalid");
    git("config", "user.name", "tooling test");
    git("config", "commit.gpgsign", "false");
    writeFileSync(path.join(repo, "tracked.txt"), "one\n");
    git("add", "tracked.txt");
    git("commit", "--quiet", "--message", "one");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** The scratch-index block and the refusal block, as the script writes them. */
  function guards(allowBranch = false): string {
    return [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `ALLOW_BRANCH=${allowBranch ? 1 : 0}`,
      block(/^git_dir=\$\(git -C "\$REPO" rev-parse --absolute-git-dir\)$/, "the scratch index"),
      block(/^branch=\$\(git -C "\$REPO" rev-parse --abbrev-ref HEAD\)$/, "the branch and dirty-tree refusals"),
    ].join("\n");
  }

  function run(scriptText: string, env: Record<string, string> = {}) {
    const file = path.join(dir, "guards.sh");
    writeFileSync(file, scriptText);
    return spawnSync("bash", [file], {
      encoding: "utf8",
      env: { ...process.env, REPO: repo, ROOT: path.join(dir, "root"), ...env },
    });
  }

  /** The inode git wrote the index to: a refresh replaces the file, so this changes. */
  function indexIno(): number {
    return Number(statSync(path.join(repo, ".git", "index")).ino);
  }

  /** git rewrites the index only when the stat information in it is stale. */
  function makeIndexStale(): void {
    const tracked = path.join(repo, "tracked.txt");
    const future = new Date(Date.now() + 5000);
    utimesSync(tracked, future, future);
  }

  it("sees a rewrite when there is one, so the next test is not looking at nothing", () => {
    // The control for everything below: a plain `git status` on a stale index
    // does replace the file. Without this, a passing test could mean the probe
    // cannot see a write at all — which is how a guard goes blind without
    // failing.
    makeIndexStale();
    const before = indexIno();
    execFileSync("git", ["status", "--porcelain"], { cwd: repo });
    expect(indexIno(), "a plain git status did not rewrite the index; this file cannot detect the bug").not.toBe(before);
  });

  it("leaves the caller's index untouched through the refusals", () => {
    makeIndexStale();
    const before = indexIno();
    const result = run(guards());
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
    expect(indexIno(), "the script's own guards rewrote the caller's index").toBe(before);
  });

  it("rewrites that index when the scratch block is left out, which is the bug", () => {
    // The control for the test above, and the reason it means anything: the
    // very same refusal lines, run without the block that points
    // GIT_INDEX_FILE somewhere else, do replace the caller's index file. Under
    // sudo that replacement is owned by root, and that is the whole report.
    makeIndexStale();
    const before = indexIno();
    const withoutScratch = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "ALLOW_BRANCH=0",
      block(/^branch=\$\(git -C "\$REPO" rev-parse --abbrev-ref HEAD\)$/, "the branch and dirty-tree refusals"),
    ].join("\n");
    expect(run(withoutScratch).status).toBe(0);
    expect(indexIno(), "the refusals did not rewrite the index, so the fix is untestable here").not.toBe(before);
  });

  it("leaves it untouched on the refusing paths too, where status is what ran", () => {
    // The reported case exactly: a dirty tree, so `git status --porcelain` is
    // the call that reaches the index, and it refuses and then exits.
    writeFileSync(path.join(repo, "tracked.txt"), "two\n");
    makeIndexStale();
    const before = indexIno();
    const result = run(guards());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has uncommitted changes");
    expect(indexIno(), "the refusing run rewrote the caller's index").toBe(before);
  });

  it("still refuses a branch that is not main, and still accepts a clean main", () => {
    // Both refusals have to fire with the scratch index in place. A fix that
    // made the tree unreadable — an empty index, a copy of the wrong file —
    // would pass the "untouched" tests above while refusing everything, so the
    // accepting path is what tells the two apart.
    const before = indexIno();
    expect(run(guards()).status).toBe(0);

    execFileSync("git", ["checkout", "--quiet", "-b", "feature"], { cwd: repo });
    makeIndexStale();
    const onFeature = indexIno();
    const refused = run(guards());
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("is on 'feature', not main");
    expect(indexIno()).toBe(onFeature);

    // And --allow-branch is the only thing that waves a dirty tree through.
    writeFileSync(path.join(repo, "tracked.txt"), "three\n");
    expect(run(guards()).status).toBe(1);
    expect(run(guards(true)).status).toBe(0);
    expect(before).toBeGreaterThan(0);
  });

  it("leaves no scratch index behind on the refusing paths either", () => {
    // The trap is EXIT, so a refusal still runs it — but a refusal is the case
    // the report is about, and "the scratch index is gone" has to be true of
    // the runs that stop early. mktemp -d makes tmp.XXXXXXXXXX, so a leak is one
    // more of them in the temporary directory.
    writeFileSync(path.join(repo, "tracked.txt"), "two\n");
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("tmp."));
    const result = run(guards());
    expect(result.status).toBe(1);
    const leaked = readdirSync(tmpdir()).filter((name) => name.startsWith("tmp.") && !before.includes(name));
    expect(leaked, `left a scratch index behind: ${leaked.join(", ")}`).toEqual([]);
  });
});

describe("install-host.sh's two privilege tiers", () => {
  it("installs the compose files the deploy units read without sudo", () => {
    // The units run as User=ubuntu and makam-deploy refuses without a readable
    // $DIR/compose.yml (exit 78). A `sudo install -m 0600` of those two files
    // is what left this host's staging compose.yml unreadable by the very
    // deploy it was installed for, so the tier boundary is locked here.
    expect(script).toMatch(/^install -m 0600 "\$REPO\/docker-compose\.prod\.yml" "\$ROOT\/staging\/compose\.yml"$/m);
    expect(script).not.toMatch(/sudo\s+install[^\n]*compose\.yml/);
  });

  it("keeps sudo for /etc and systemd, and never runs git as root", () => {
    // What sudo is for here, so the split is not read as an accident: the nginx
    // snippet and the units are root's, $ROOT is ubuntu's.
    expect(script).toMatch(/^sudo install -o root -g root -m 0644[^\n]*\/etc\/nginx\/snippets\//m);
    expect(script).toMatch(/^for unit in "\$REPO"\/deploy\/systemd\/\*\.service "\$REPO"\/deploy\/systemd\/\*\.timer; do\n  sudo install -m 0644 "\$unit" \/etc\/systemd\/system\/$/m);
    expect(script, "the script must not escalate git itself").not.toMatch(/sudo\s+git\b/);
  });

  it("says how it is run, and warns against the one that breaks it", () => {
    // The usage line used to say "as ubuntu" with no sudo in it while five of
    // its writes needed root, and the rest did not: no invocation followed it.
    expect(script).toMatch(/^#   deploy\/install-host\.sh +# as ubuntu, from a clean checkout of main$/m);
    expect(script).toMatch(/Not `sudo deploy\/install-host\.sh`/);
  });
});
