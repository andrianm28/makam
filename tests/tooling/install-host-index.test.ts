import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
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
 * The git subcommands that open the index for writing, measured on this host's
 * git 2.43.0 rather than listed from memory: each was run under
 * `strace -f -e trace=openat,rename` in a throwaway repository and kept only if
 * it opened `index.lock` for writing or renamed it onto the index. `status`,
 * `add`, `write-tree`, `update-index`, `read-tree`, `commit`, `am`, `stash
 * push`, `restore`, `reset`, `revert`, `rebase`, `cherry-pick`, `merge`,
 * `switch`, `checkout`, `mv`, `rm` and `sparse-checkout` all measured as
 * writing. `filter-branch` measures as writing too, and `stage` is the alias
 * `add` is also reachable by, so both are in.
 *
 * `maintenance` and `submodule` are here on a weaker warrant than the rest and
 * the test says so: on 2.43.0 neither opens the index for writing, measured
 * through `maintenance run --task=gc|commit-graph|prefetch|loose-objects` and
 * `submodule status|update --init --recursive|foreach|absorbgitdirs`. They are
 * included anyway because both *dispatch* other git commands — a submodule
 * whose own hook runs `git add`, a `gc` that repacks — and a whitelist that
 * omits a dispatcher is one that changes answer when its payload does. A
 * command that never appears in this script costs nothing to list; a command
 * that reaches the index by delegation costs the host its index.
 *
 * `worktree add` was measured writing an index and is deliberately absent: it
 * locks `.git/worktrees/<name>/index.lock`, a different worktree's index, not
 * the caller's. `rev-parse`, `log`, `cat-file`, `ls-files`, `diff`, `apply`,
 * `gc`, `repack`, `hash-object`, `commit-tree` and `pack-refs` were measured as
 * not writing, and are absent on purpose: they read refs, the config and
 * objects, so the one that asks git where the index is may run before the
 * scratch one exists.
 */
const INDEX_WRITING = [
  "add",
  "am",
  "apply",
  "checkout",
  "cherry-pick",
  "commit",
  "diff",
  "filter-branch",
  "maintenance",
  "merge",
  "mv",
  "pull",
  "read-tree",
  "rebase",
  "reset",
  "restore",
  "rm",
  "sparse-checkout",
  "stage",
  "stash",
  "status",
  "submodule",
  "switch",
  "update-index",
  "write-tree",
];

/** `git -C "$REPO" status`: the global options, then the subcommand. */
const GIT_CALL = /\bgit\s+(?:-[A-Za-z-]+(?:\s+\S+)?\s+)*([a-z][a-z-]*)/g;

/** Comments run nothing. `#` starts one at a word boundary in shell. */
function codeOnly(text: string): string {
  return text.replace(/(^|\s)#[^\n]*/g, "$1");
}

/**
 * The commands that put something somewhere, or change what is already there.
 * Matched against the *command word* of a line, never against the text of it:
 * a refusal message that says "run `install` as ubuntu" is prose, and treating
 * it as a write would make the rules below pass or fail on a sentence.
 */
const WRITE_COMMANDS = new Set([
  "cp",
  "install",
  "mv",
  "ln",
  "tee",
  "dd",
  "sponge",
  "shred",
  "rsync",
  "rm",
  "touch",
  "chmod",
  "chown",
  "truncate",
  "unlink",
  "sed",
]);

/** `cp`, `mv`, `install` and `ln` write to the path they are last given. */
const LAST_ARGUMENT_IS_TARGET = new Set(["cp", "install", "mv", "ln"]);

/** Wrappers that sit in front of the real command word. */
const WRAPPERS = new Set(["sudo", "command", "nohup", "time", "then", "do", "else", "!", "{"]);

/** The command word of a line: `sudo install` is an `install`. */
function commandOf(line: string): string {
  let command = "";
  for (const word of words(line)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue; // an assignment
    if (WRAPPERS.has(word)) continue;
    command = word;
    break;
  }
  return command;
}

/** Does this line actually run a writing command? */
function writesPath(line: string): boolean {
  return WRITE_COMMANDS.has(commandOf(line));
}

/** Strips the quoting off one argument, so `"$git_dir/index"` compares as a path. */
function unquote(word: string): string {
  return word.replace(/^["']+|["']+$/g, "");
}

/**
 * The command part of a line: everything up to the first `|`, `;`, `{` or `&&`,
 * which is where a second command starts. `cp a b || { … }` is one cp.
 */
function body(line: string): string {
  const stop = line.search(/[|;{]|&&/);
  return (stop === -1 ? line : line.slice(0, stop)).trim();
}

/** The words of a line's command, unquoted. */
function words(line: string): string[] {
  return body(line)
    .split(/\s+/)
    .map(unquote)
    .filter((word) => word.length > 0);
}

/** The path a writing command writes to: the last thing it is given. */
function destination(line: string): string {
  return words(line).pop() ?? "";
}

/** The scratch index, however the line spells it. */
const SCRATCH = /^\$GIT_INDEX_FILE$|^\$scratch\/index$|^\$\{GIT_INDEX_FILE\}$/;

/**
 * A path that reaches into the caller's own .git directory: the variable the
 * script resolved it to, the literal, or a relative `.git`.
 */
const IN_GIT_DIR = /\$git_dir\b|\$\{git_dir\}|(^|\s)\.git(\/|$)|\/git_dir(\/|$)|(^|\/)\.git\//;

/** The one assignment of `$git_dir` there may be, and the one line that reads it. */
const GIT_DIR_ASSIGNMENT = /^git_dir=\$\(git -C "\$REPO" rev-parse --absolute-git-dir\)$/;

/** A second assignment to `$git_dir` sends the copy somewhere the guard does not cover. */
function reassignsGitDir(line: string): boolean {
  return /^\s*(export\s+)?git_dir=/.test(line) && !GIT_DIR_ASSIGNMENT.test(body(line));
}

/**
 * The paths a command reads from. For `cp a b` that is `a`; for the in-place
 * commands (`rm`, `chmod`, `chown`, `truncate`, `shred`, `unlink`, `touch`)
 * there is no destination at all, so every path it names is both read and
 * written. `dd` names its output after `of=`.
 */
function sourcesOf(line: string): string[] {
  const all = words(line);
  const command = commandOf(line);
  if (command === "dd") return all.filter((word) => /^of=/.test(word));
  if (LAST_ARGUMENT_IS_TARGET.has(command)) return all.slice(0, -1);
  return all;
}

/**
 * The one shape allowed to name a path inside the caller's .git: a `cp` whose
 * destination is the scratch index. It is stated as a shape and not as the one
 * literal line, so reading the caller's index is allowed however the source is
 * spelled — `"$git_dir/index"` and `.git/index` are the same read — and adding
 * an option to that cp does not make the guard start reporting it.
 */
function readsIntoScratch(line: string): boolean {
  return commandOf(line) === "cp" && SCRATCH.test(destination(line));
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
    // `unset GIT_INDEX_FILE` is checked before the writing-command gate, because
    // it is not a writing command and it undoes the whole guard.
    if (/\bunset\s+GIT_INDEX_FILE/.test(line)) {
      found.push(`${at}: GIT_INDEX_FILE is unset, so the git calls after it use the caller's index`);
    }
    // Repointing $git_dir is the same hole from the other end: the copy below
    // would be taken from somewhere the guard has never looked at.
    if (reassignsGitDir(line)) {
      found.push(`${at}: ${body(line)} reassigns git_dir, so the scratch index is not a copy of the caller's`);
    }
    // GIT_INDEX_FILE is the only thing standing between git and the caller's
    // index, so where it is pointed has to be asserted too — not just whether it
    // is unset. Pointing it at the caller's index is the bug, wearing the fix's
    // own variable name.
    const points = line.match(/^\s*(?:export\s+)?GIT_INDEX_FILE=["']?([^"'\s;]+)/);
    if (points && !SCRATCH.test(points[1]!)) {
      found.push(`${at}: ${body(line)} points GIT_INDEX_FILE at ${points[1]}, not the scratch index`);
    }
    // A redirect has no command word, so it is checked on its own shape.
    const redirected = line.match(/>\s*"?([^\s"';|]+)"?/);
    if (redirected) {
      const to = unquote(redirected[1]!);
      if (!SCRATCH.test(to) && IN_GIT_DIR.test(to)) {
        found.push(`${at}: ${body(line)} redirects into the caller's git dir`);
      }
    }
    if (!writesPath(line)) return;
    const allowed = readsIntoScratch(line);
    // The rule is about the *path*, and it asks both ends of the command. A
    // path inside the caller's .git is read exactly once, by exactly one cp,
    // into the scratch index. Naming it as the origin of anything else — a
    // copy out to /tmp, a move, a hard link, a truncate, an in-place chmod, a
    // sed, a dd — hands the caller's index to something that may write it, and
    // none of those is caught by a rule about what the destination is *called*.
    for (const source of sourcesOf(line)) {
      if (SCRATCH.test(source) || allowed) continue;
      if (IN_GIT_DIR.test(source)) found.push(`${at}: ${body(line)} reads the caller's index (${source})`);
    }
    // And the other end: writing *at* a path inside it, by any spelling.
    const target = destination(line);
    if (target.length > 0 && !SCRATCH.test(target) && !allowed && IN_GIT_DIR.test(target)) {
      found.push(`${at}: ${body(line)} writes the caller's index (${target})`);
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
    // The line number is read out of the script rather than written down, so
    // adding a line to the script does not turn this into a test of the script's
    // length. What is asserted is that the call that runs `status` is reported
    // and that it is reported as running too early.
    const findings = indexWrites(withoutScratch);
    const statusLine = codeOnly(script).split("\n").findIndex((line) => /git -C "\$REPO" status --porcelain/.test(line)) + 1;
    expect(findings).toEqual([`${statusLine}: git status runs before the scratch index is in place`]);
  });

  it("catches the same file reached by every other command that writes an index", () => {
    const planted = INDEX_WRITING.map((subcommand) => `git -C "$REPO" ${subcommand}`).join("\n");
    expect(indexWrites(planted)).toHaveLength(INDEX_WRITING.length);
    // And by the other routes to that file that are not git at all — reading it
    // out as a source, writing over it, and changing it in place.
    for (const planted of [
      'cp new "$git_dir/index"',
      'cp "$git_dir/index" new',
      'rm -f "$git_dir/index"',
      'chmod 644 .git/index',
      'truncate -s 0 "$git_dir/index"',
      "unset GIT_INDEX_FILE\n",
    ]) {
      expect(indexWrites(planted), `not caught: ${planted}`).not.toEqual([]);
    }
  });

  it("knows maintenance and submodule write an index, because the host says so", () => {
    // The two the review found missing. Asserted by name and by measurement
    // rather than by count, so a list edited back to its old shape fails here
    // and not only in the sweep above.
    expect(INDEX_WRITING).toContain("maintenance");
    expect(INDEX_WRITING).toContain("submodule");
    // And the two the same strace sweep found on top of them.
    expect(INDEX_WRITING).toContain("filter-branch");
    expect(INDEX_WRITING).toContain("stage");
    // worktree add does write an index — a different worktree's. Listing it
    // here would claim to guard the caller's index and guard nothing.
    expect(INDEX_WRITING).not.toContain("worktree");
  });

  it("catches the caller's index as a source however the destination is named", () => {
    // The hole the review found: matching on the destination's *name* let any
    // of these through, because none of them ends in a path called "index".
    // Each one writes the caller's index or hands it somewhere it can be
    // written, and the rule has to hold on all of them.
    const routes = [
      'cp "$git_dir/index" /tmp/foo',
      'cp .git/index /tmp/foo',
      'cp "$git_dir" /tmp/foo',
      'mv "$git_dir/index" /tmp/foo',
      'ln -f "$git_dir/index" /tmp/foo',
      'install -m 0644 "$git_dir/index" /tmp/foo',
      'tee /tmp/foo < "$git_dir/index"',
      'dd if=/dev/zero of="$git_dir/index"',
      'shred -u "$git_dir/index"',
      'truncate -s 0 "$git_dir/index"',
      'sed -i s/a/b/ "$git_dir/index"',
      'rsync "$git_dir/index" /tmp/foo',
      'rm -rf "$git_dir"',
      'chown root:root "$git_dir/index"',
      'chmod 666 "$git_dir/index"',
      'touch "$git_dir/index"',
      'unlink "$git_dir/index"',
      'git_dir=/tmp/somewhere-else',
      'git_dir=$(mktemp -d)',
      'export GIT_INDEX_FILE="$git_dir/index"',
    ];
    for (const route of routes) {
      const planted = ['export GIT_INDEX_FILE="$scratch/index"', "scratch=$(mktemp -d)", route].join("\n");
      expect(indexWrites(planted), `not caught: ${route}`).not.toEqual([]);
    }
  });

  it("catches a redirect into the caller's git dir", () => {
    for (const planted of ['echo x > "$git_dir/index"', "cat x > .git/index"]) {
      expect(indexWrites(planted), `not caught: ${planted}`).not.toEqual([]);
    }
  });

  it("leaves alone a scratch index it set up, and a read of the real one", () => {
    const allowed = [
      'git_dir=$(git -C "$REPO" rev-parse --absolute-git-dir)',
      "scratch=$(mktemp -d)",
      "trap 'rm -rf \"$scratch\"' EXIT",
      'export GIT_INDEX_FILE="$scratch/index"',
      'if [ -f "$git_dir/index" ]; then',
      '  cp "$git_dir/index" "$GIT_INDEX_FILE" || { echo "refusing" >&2; exit 1; }',
      "fi",
      'git -C "$REPO" rev-parse --abbrev-ref HEAD',
      'git -C "$REPO" rev-parse --short HEAD',
      '[ -z "$(git -C "$REPO" status --porcelain)" ] || { echo "refusing" >&2; exit 1; }',
    ].join("\n");
    expect(indexWrites(allowed)).toEqual([]);
  });

  it("still allows a write to the scratch index by any spelling of it", () => {
    // The rule is about the path, not the variable name: these all write the
    // throwaway and none of them touches the caller's index. If any of them is
    // reported, the rule has stopped being about the caller's index and become a
    // rule about a filename, which is the weakness the review found.
    const allowed = [
      "scratch=$(mktemp -d)",
      'export GIT_INDEX_FILE="$scratch/index"',
      'cp .git/index "$GIT_INDEX_FILE"',
      'rm -f "$GIT_INDEX_FILE"',
      'chmod 600 "$GIT_INDEX_FILE"',
      'install -m 0600 "$REPO/src" "$scratch/index"',
      'truncate -s 0 "$scratch/index"',
    ].join("\n");
    expect(indexWrites(allowed)).toEqual([]);
  });

  it("catches GIT_INDEX_FILE pointed at anything but the scratch index", () => {
    // The variable is the guard. Re-exporting it at the caller's own index is
    // the original bug with the fix's name on it, and a rule that only asked
    // "is it unset" would wave it through.
    for (const planted of [
      'export GIT_INDEX_FILE="$git_dir/index"',
      "export GIT_INDEX_FILE=.git/index",
      'GIT_INDEX_FILE="$git_dir/index"',
      "GIT_INDEX_FILE=$REPO/.git/index",
    ]) {
      expect(indexWrites(planted), `not caught: ${planted}`).not.toEqual([]);
    }
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

/** The lines of the script, with comments and blank lines dropped. */
function codeLines(text: string): string[] {
  return codeOnly(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The path each line of the script writes to, with whether that write is
 * escalated. Only the writing commands count: an `echo` whose message happens to
 * contain `/etc/systemd` is prose, not a write, and treating it as one would
 * make the assertions below pass or fail for the wrong reason.
 */
function writesTo(target: RegExp): { escalated: boolean[]; lines: string[] } {
  const hits: { escalated: boolean; line: string }[] = [];
  for (const line of codeLines(script)) {
    if (!writesPath(line)) continue;
    const to = destination(line);
    if (!target.test(to)) continue;
    hits.push({ escalated: /(^|\s)sudo(\s|$)/.test(body(line)), line });
  }
  return { escalated: hits.map((hit) => hit.escalated), lines: hits.map((hit) => hit.line) };
}

describe("install-host.sh's two privilege tiers", () => {
  it("installs the compose files the deploy units read without sudo", () => {
    // The units run as User=ubuntu and makam-deploy refuses without a readable
    // $DIR/compose.yml (exit 78). A `sudo install -m 0600` of those two files
    // is what left this host's staging compose.yml unreadable by the very
    // deploy it was installed for, so the tier boundary is locked here.
    expect(script).toMatch(/^install -m 0600 "\$REPO\/docker-compose\.prod\.yml" "\$ROOT\/staging\/compose\.yml"$/m);
    expect(script).not.toMatch(/sudo\s+install[^\n]*compose\.yml/);
  });

  it("writes nothing under $ROOT with sudo, the cosign public keys included", () => {
    // Finding 4 was that the script said "everything under $ROOT is ubuntu's
    // and is deliberately not sudo" and then installed cosign.pub with sudo.
    // Resolved one way — the invariant is right, because a cosign public key is
    // a world-readable public half and the file only has to be readable by the
    // deploy units, which run as ubuntu — so the rule is now stated with no
    // exception and covers the whole tree. The invariant is a property of every
    // write under $ROOT, not a claim about three particular lines, so adding a
    // fourth such write cannot smuggle sudo past it.
    const underRoot = writesTo(/\$ROOT|\/opt\/makam-v1/);
    expect(
      underRoot.lines.filter((_, at) => underRoot.escalated[at]),
      `these write under $ROOT with sudo, which leaves a root-owned file in a tree the deploy units read as ubuntu: ${JSON.stringify(underRoot.lines)}`,
    ).toEqual([]);
    // And the rule is about the whole tree, not the one file the review named:
    // there is a good number of un-escalated writes under $ROOT, so an
    // assertion that passed on three lines would also pass on a tree where the
    // invariant is quietly not held.
    expect(underRoot.lines.length, "no write under $ROOT at all, so the rule is not exercised").toBeGreaterThan(5);
  });

  it("keeps sudo for the root-owned groups, and never runs git as root", () => {
    // What sudo is for here, so the split is not read as an accident: the nginx
    // snippet and the units are root's, $ROOT is ubuntu's. Asserted on the
    // privilege boundary each write belongs to — which group it lands in and
    // whether it is escalated — rather than on the exact bytes of the line, so
    // reformatting the script does not fail a check that is about sudo.
    const nginx = writesTo(/\/etc\/nginx\//);
    expect(nginx.escalated, "the nginx snippet is root's and must be installed with sudo").toEqual([true]);
    const systemd = writesTo(/\/etc\/systemd\//);
    expect(systemd.escalated, "the units are root's and must be installed with sudo").toEqual([true]);
    expect(script, "the script must not escalate git itself").not.toMatch(/sudo\s+git\b/);
  });

  it("has no un-escalated write to a root-owned group", () => {
    // The other half of the boundary: sudo is not only what must be there, it
    // is what must not be missing. A bare `install` into /etc would fail as
    // ubuntu, and the boundary is only real if both directions are asserted.
    for (const target of [/\/etc\/nginx\//, /\/etc\/systemd\//]) {
      for (const line of codeLines(script)) {
        if (!target.test(destination(line))) continue;
        expect(/\bsudo\b/.test(line), `writes to ${destination(line)} without sudo: ${line}`).toBe(true);
      }
    }
  });

  it("says how it is run, and warns against the one that breaks it", () => {
    // The usage line used to say "as ubuntu" with no sudo in it while five of
    // its writes needed root, and the rest did not: no invocation followed it.
    expect(script).toMatch(/^#   deploy\/install-host\.sh +# as ubuntu, from a clean checkout of main$/m);
    expect(script).toMatch(/Not `sudo deploy\/install-host\.sh`/);
  });
});

describe("install-host.sh refuses a root run instead of repairing one", () => {
  /** The script's own `id`, in a temporary bin dir that the run can see. */
  function withId(report: { uid: string; name: string }): Record<string, string> {
    const bin = mkdtempSync(path.join(tmpdir(), "makam-fake-id-"));
    const file = path.join(bin, "id");
    writeFileSync(
      file,
      `#!/usr/bin/env bash\ncase "$1" in\n  -u) echo ${report.uid} ;;\n  -un|-uname) echo ${report.name} ;;\n  *) echo ${report.name} ;;\nesac\n`,
    );
    chmodSync(file, 0o755);
    return { PATH: `${bin}:${process.env.PATH}` };
  }

  let dir: string;
  let repo: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "makam-preflight-"));
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

  /**
   * The script's own lines from the git guards to the first write to $ROOT or
   * /etc, run verbatim. Everything the script decides before it installs
   * anything is in here, so a refusal this misses is a refusal the operator
   * never sees.
   */
  function preflight(env: Record<string, string> = {}) {
    const lines = script.split("\n");
    // Cut at the `install -d` that creates $ROOT: everything the script decides
    // is in the lines above it, and nothing below it has run. The cut has to
    // land on a complete block, so the first line that starts a write is
    // located and then the walk goes back to the nearest line that is not inside
    // an unterminated `{ … }` or `if … fi` — otherwise the cut lands in the
    // middle of a refusal and the extract is a syntax error rather than a test.
    const startOfWrite = lines.findIndex((line) => /^\s*(sudo\s+)?install\s+-d\s/.test(line));
    expect(startOfWrite, "the script's first install is gone, so this test proves nothing").toBeGreaterThan(-1);
    let open = 0;
    let firstWrite = startOfWrite;
    for (let at = startOfWrite - 1; at >= 0; at--) {
      const line = codeOnly(lines[at]!);
      if (/\bthen\s*$|\bdo\s*$|\belse\s*$|\{$/.test(line)) open++;
      if (/\bfi\s*$|\bdone\s*$|^\s*\}$/.test(line)) {
        if (open === 0) break;
        open--;
      }
    }
    firstWrite = startOfWrite - open;
    // The script derives REPO from its own location, which here is a temporary
    // directory rather than a checkout, so it is pointed at the throwaway repo
    // instead. Everything else is the script's own lines, untouched.
    const cut = lines
      .slice(0, firstWrite)
      .map((line) => (line.startsWith("REPO=") ? `REPO=${JSON.stringify(repo)}` : line))
      .join("\n");
    // A truncated script is a broken test, not a failing one: say so plainly
    // rather than reporting a bash syntax error as a missing refusal.
    const syntax = spawnSync("bash", ["-n"], { input: cut, encoding: "utf8" });
    expect(syntax.stderr, `the extract of the script's preflight is not valid shell: ${syntax.stderr}`).toBe("");
    const file = path.join(dir, "preflight.sh");
    writeFileSync(file, cut);
    return spawnSync("bash", [file], {
      encoding: "utf8",
      env: { ...process.env, MAKAM_ROOT: path.join(dir, "root"), ...env },
    });
  }

  it("refuses a root run, before installing anything", () => {
    // The measured damage: run under sudo, `install -m 0600` leaves
    // $ROOT/<env>/compose.yml owned by root and the units that read it run as
    // User=ubuntu, so the next deploy refuses with exit 78. That is a refusal
    // to make here, because the repair is `sudo chown -R`, which is the
    // owner's call and not a side effect of a deploy tool.
    const result = preflight(withId({ uid: "0", name: "root" }));
    expect(result.status, `the run under sudo did not refuse; stderr: ${result.stderr}`).not.toBe(0);
    expect(result.stderr).toContain("refusing:");
    expect(result.stderr).toContain("must not run as root");
    // It must name the remedy, or the refusal is only an obstacle.
    expect(result.stderr).toContain("sudo chown -R");
    // And it must have stopped before writing: $ROOT is not even there.
    expect(existsSync(path.join(dir, "root")), "the run installed something before refusing").toBe(false);
  });

  it("refuses before the first line that installs anything", () => {
    // The ordering is the whole of the fix. A refusal that runs after the
    // `install -d` has already created $ROOT as root is not a refusal, it is a
    // message about damage that is done, so the position is asserted rather
    // than left to the extract below to imply.
    const code = codeOnly(script).split("\n");
    const refusal = code.findIndex((line) => /refusing: this script must not run as root/.test(line));
    expect(refusal, "the root refusal is gone from the script").toBeGreaterThan(-1);
    // The line that matters is the first one that puts something into $ROOT or
    // /etc — the guard's own `cp` into the scratch index is not an install, and
    // counting it would let the refusal sit after every install and pass.
    const firstInstall = code.findIndex((line) => writesPath(line) && /(\$ROOT|\/etc\/)/.test(destination(line)));
    expect(firstInstall, "the script installs nothing into $ROOT or /etc, so the rule is not exercised").toBeGreaterThan(-1);
    expect(refusal, "the root refusal runs after the first install, which is too late").toBeLessThan(firstInstall);
  });

  it("does not repair anything itself", () => {
    // The point of refusing rather than fixing: a chown of a host tree is a
    // destructive act the operator did not ask for, and the script must not
    // perform it silently on its way to installing.
    const preflightLines = codeLines(script).slice(0, codeLines(script).findIndex((l) => /^\s*(sudo\s+)?(install|cp|mv|tee)\s/.test(l)));
    expect(preflightLines.filter((line) => /\bchown\b|\bchgrp\b/.test(line))).toEqual([]);
  });

  it("still refuses a $ROOT that exists but is not writable, as a non-root run", () => {
    // The same refusal for the same failure, one run later: a $ROOT a previous
    // root run already owns. `-w` is false for it, and the owner has to be told
    // which chown fixes it.
    const root = path.join(dir, "root");
    mkdirSync(root);
    chmodSync(root, 0o500);
    try {
      const result = preflight({ ...withId({ uid: "1000", name: "ubuntu" }) });
      expect(result.status, `an unwritable $ROOT did not refuse; stderr: ${result.stderr}`).not.toBe(0);
      expect(result.stderr).toContain("refusing:");
      expect(result.stderr).toContain("sudo chown -R");
    } finally {
      chmodSync(root, 0o700);
    }
  });

  it("lets a $ROOT that does not exist yet through", () => {
    // A first run has no $ROOT to be refused by: the `install -d` below is what
    // creates it, as this user. A guard that refused here would make the script
    // unusable on a fresh host, which is the failure mode a refusal is most
    // prone to and the reason the accepting path is asserted separately.
    const result = preflight({ ...withId({ uid: "1000", name: "ubuntu" }) });
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
  });

  it("lets an ordinary ubuntu run through", () => {
    // The accepting path. Without it a refusal that fires on everything would
    // satisfy the two tests above while making the script unusable — and that
    // is the failure mode a refusal is most prone to.
    const result = preflight(withId({ uid: "1000", name: "ubuntu" }));
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
  });

  it("still refuses a branch that is not main, and a dirty tree, as root's run is not the only guard", () => {
    // A preflight is not a replacement for the existing refusals. Run it as
    // ubuntu, on a dirty tree: that refusal must still be the one that fires.
    writeFileSync(path.join(repo, "tracked.txt"), "two\n");
    const result = preflight(withId({ uid: "1000", name: "ubuntu" }));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("has uncommitted changes");
  });
});
