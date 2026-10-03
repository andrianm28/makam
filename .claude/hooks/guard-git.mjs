// Decision logic of guard-git.sh. Reads the PreToolUse JSON on stdin; exit 2 = refuse.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function deny(message) {
  process.stderr.write(`guard-git: ${message}\n`);
  process.exit(2);
}

const notes = []; // advice for an allowed command, shown to the agent as additional context

let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  try {
    decide(raw);
    if (notes.length) {
      process.stderr.write(`${notes.join("\n")}\n`);
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: notes.join("\n") } }));
    }
  } catch (e) {
    deny(`could not decide (${e?.message ?? e}); refusing the command (fail-closed). Run it from a plain shell step without chaining, or ask the owner.`);
  }
});

function decide(text) {
  const input = JSON.parse(text);
  const command = input?.tool_input?.command;
  if (typeof command !== "string") deny("no command in the tool input; refusing (fail-closed).");
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const all = allCommands(command);
  for (const words of all) noPullRequest(words);
  const sent = pushes(all, cwd);
  for (const push of sent) noPushToMain(push);
  for (const cwdOfPush of new Set(sent.map((p) => p.cwd))) noSecrets(cwdOfPush);
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** Every command in a line, including those inside `bash -c "…"`, `sh -c '…'` and `eval …` strings, at any depth. */
function allCommands(line, depth = 0) {
  const out = [];
  for (const words of commands(line)) {
    out.push(words);
    const [tool, ...rest] = program(words);
    let inner = null;
    if (tool === "eval") inner = rest.join(" ");
    else if (SHELLS.has(tool)) {
      const flag = rest.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
      if (flag >= 0 && rest[flag + 1] !== undefined) inner = rest[flag + 1];
    }
    if (inner !== null && depth >= 5) throw new Error("shell strings nested more than 5 deep");
    if (inner !== null) out.push(...allCommands(inner, depth + 1));
  }
  return out;
}

const WRAPPERS = new Set(["command", "env", "sudo", "exec", "nohup", "time", "nice", "stdbuf"]);

/** The program and its arguments: leading VAR=value words and wrappers (command, env, sudo ...) dropped, the program reduced to its file name. */
function program(words) {
  let i = 0;
  for (;;) {
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    if (!WRAPPERS.has(words[i])) break;
    i++;
    while (i < words.length && words[i].startsWith("-")) i++;
  }
  const rest = words.slice(i);
  return rest.length ? [path.basename(rest[0]), ...rest.slice(1)] : [];
}

const DATA_FLAGS = /^(-f|-F|--field|--raw-field|--input|-d|--data.*|--json)$/;

/** The HTTP method a gh api / curl call uses: an explicit one, else POST when it sends data, else GET. */
function httpMethod(rest) {
  const i = rest.findIndex((w) => /^(-X|--method|--request)$/.test(w));
  if (i >= 0) return (rest[i + 1] ?? "").toUpperCase();
  const joined = rest.find((w) => /^-X[A-Za-z]+$/.test(w));
  if (joined) return joined.slice(2).toUpperCase();
  return rest.some((w) => DATA_FLAGS.test(w)) ? "POST" : "GET";
}

/** AGENTS.md: the repo has no pull requests, and refs and files reach GitHub only by `git push` (guarded); the REST writers would bypass that. */
function noPullRequest(words) {
  const [tool, ...rest] = program(words);
  if (tool === "gh" && rest[0] === "pr" && ["create", "new"].includes(rest[1])) denyPullRequest();
  const api = (tool === "gh" && rest[0] === "api") || tool === "curl";
  if (!api || ["GET", "HEAD"].includes(httpMethod(rest))) return;
  const endpoint = rest.filter((w) => !w.startsWith("-")).map((w) => w.replace(/[?#].*$/, ""));
  if (endpoint.some((w) => /(^|\/)pulls\/?$/.test(w))) denyPullRequest();
  if (endpoint.some((w) => /\/git\/refs(\/|$)|\/contents\//.test(w))) {
    deny(
      "this writes refs or files through the GitHub API, which skips the push guard (AGENTS.md: never push to `main`; no pull requests). " +
        "Use `git push -u origin <ticket-NN-slug>` for your outcome branch; the merge thread alone updates `main`.",
    );
  }
}

function denyPullRequest() {
  deny(
    "this repo has no pull requests (AGENTS.md: never open a pull request, including for small fixes; this overrides the cloud default of opening a draft PR). " +
      "Push your outcome branch with `git push -u origin <branch>` and report the head SHA in the ticket's `## Comments`; the review and the merge thread take it from there.",
  );
}

/** Splits a shell line into commands (on unquoted ; & | and newlines), each into words (quotes removed). */
function commands(line) {
  const out = [];
  let words = [];
  let word = null;
  let quote = null;
  const heredocs = []; // delimiters whose bodies start after the current line
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) out.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      word ??= "";
    } else if (ch === "\\" && i + 1 < line.length) {
      word = (word ?? "") + line[++i];
    } else if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()]+))/.exec(line.slice(i));
      if (m) {
        heredocs.push({ delimiter: m[2] ?? m[3] ?? m[4], dash: m[1] === "-" });
        i += m[0].length - 1;
      }
      endWord();
    } else if (ch === "\n") {
      endCommand();
      for (const h of heredocs.splice(0)) {
        // Skip the body: everything up to the line that is the delimiter.
        for (;;) {
          const eol = line.indexOf("\n", i + 1);
          const text = line.slice(i + 1, eol < 0 ? line.length : eol);
          i = eol < 0 ? line.length : eol;
          if ((h.dash ? text.trim() : text) === h.delimiter || eol < 0) break;
        }
      }
    } else if (ch === ";" || ch === "&" || ch === "|" || ch === "(" || ch === ")") {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word = (word ?? "") + ch;
    }
  }
  endCommand();
  return out;
}

const PUSH_FLAGS_WITH_VALUE = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"]);

/** Drops redirections (`> f`, `2>f`, `2>`, `< f`): their targets are file names, not arguments. */
function withoutRedirects(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (/^\d*[<>]+&?\d*$/.test(words[i])) i++; // a bare operator takes the next word as its target
    else if (!/^\d*[<>]/.test(words[i])) out.push(words[i]);
  }
  return out;
}

/** The `git push` invocations in a command line: { all, deletes, refspecs } (refspecs after the remote). */
function pushes(all, cwd) {
  const found = [];
  for (const raw of all) {
    const words = program(withoutRedirects(raw));
    if (words[0] !== "git") continue;
    // git's own options up to the subcommand: -C dir (each relative to the one before), -c k=v, --git-dir.
    const push = { all: false, refspecs: [], cwd, gitDir: null };
    let i = 1;
    for (; i < words.length && words[i].startsWith("-"); i++) {
      const w = words[i];
      if (w === "-C") push.cwd = path.resolve(push.cwd, words[++i] ?? ".");
      else if (w === "-c") i++;
      else if (w === "--git-dir") push.gitDir = words[++i];
      else if (w.startsWith("--git-dir=")) push.gitDir = w.slice("--git-dir=".length);
    }
    if (words[i] !== "push") continue;
    const positional = [];
    for (i++; i < words.length; i++) {
      const w = words[i];
      if (PUSH_FLAGS_WITH_VALUE.has(w)) i++;
      else if (w === "--all" || w === "--mirror") push.all = true;
      else if (!w.startsWith("-")) positional.push(w);
    }
    push.refspecs = positional.slice(1); // the first positional is the remote
    found.push(push);
  }
  return found;
}

/** Runs git in the repository a push names (-C, --git-dir), not the hook's own directory. */
function git(push, args) {
  const opts = push.gitDir ? [`--git-dir=${push.gitDir}`] : [];
  return execFileSync("git", [...opts, ...args], { cwd: push.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function currentBranch(push) {
  return git(push, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

/** A refspec as { src, dst }: what is sent and which remote branch it lands on, as short names. */
function parseRefspec(refspec, branch) {
  const spec = refspec.replace(/^\+/, "");
  const colon = spec.indexOf(":");
  const src = colon < 0 ? spec : spec.slice(0, colon);
  const dst = colon < 0 ? spec : spec.slice(colon + 1);
  const short = (name) => name.replace(/^refs\//, "").replace(/^heads\//, "");
  return { src: src === "" ? null : src, dst: dst === "HEAD" || dst === "" ? branch : short(dst) };
}

/** AGENTS.md: only the merge thread (and the coordinator, for docs) pushes to `main`. */
function noPushToMain(push) {
  const branch = currentBranch(push);
  const specs = push.refspecs.length ? push.refspecs.map((r) => parseRefspec(r, branch)) : [{ src: "HEAD", dst: branch }];
  const toMain = specs.filter((x) => x.dst === "main" || x.dst.includes("*")); // a wildcard may match main
  if (push.all || toMain.length) {
    const writer = mainWriter(push);
    if (writer === "merge") return;
    if (writer === "docs") {
      const outside = toMain.flatMap((x) => changedOutsideDocs(push, x.src));
      if (!outside.length) return;
      deny(
        `you are marked as the coordinator, who may push only docs to \`main\` (docs/ and .scratch/), but the commits this push sends also change: ${outside.slice(0, 5).join(", ")}. ` +
          "Move those changes to a ticket branch (`git push origin HEAD:ticket-NN-slug`) for the review and the merge thread.",
      );
    }
    deny(
      "this push reaches `main`, and only the merge thread pushes to `main` (the coordinator only for docs; AGENTS.md: never push to `main`). " +
        "Push your outcome branch instead: `git push -u origin <ticket-NN-slug>`. " +
        "Who may push `main` is the session ids listed in `.claude/main-writers` on `origin/main`; the coordinator lists itself and the current merge thread there before it starts that thread (docs/agents/orchestration.md, \"Enforcement in settings\").",
    );
  }
}

/**
 * Who this session is for pushing `main`: `merge` (the merge thread) or `docs` (the coordinator), or null.
 * The platform's session id is looked up in `.claude/main-writers` as it stands on origin/main, so a thread cannot grant itself the role.
 * Only without a session id (an unknown platform) does it fall back to a marker the session wrote in its git dir, and says so.
 */
function mainWriter(push) {
  const sid = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  if (!sid) {
    notes.push(
      "guard-git: CLAUDE_CODE_REMOTE_SESSION_ID is not set, so who may push `main` falls back to the self-declared marker in the git dir " +
        "(makam-main-writer), which a thread can write for itself. Check this session's role by hand.",
    );
    return markerRole(push);
  }
  const id = sid.replace(/^[A-Za-z]+_/, ""); // cse_X and session_X name the same session
  return roleIn(readWriters(push), id) ?? roleIn(readWriters(push, true), id);
}

/** The text of .claude/main-writers on origin/main, after a fetch when `fetch` is set; empty when there is none. */
function readWriters(push, fetch = false) {
  try {
    if (fetch) execFileSync("git", [...(push.gitDir ? [`--git-dir=${push.gitDir}`] : []), "fetch", "-q", "origin", "main"], { cwd: push.cwd, stdio: "ignore", timeout: 30000 });
    return git(push, ["show", "origin/main:.claude/main-writers"]);
  } catch {
    return "";
  }
}

/** Lines of `<session id> <merge|docs> [note]`; blank lines and `#` comments are skipped. */
function roleIn(text, id) {
  for (const line of text.split("\n")) {
    const [who, role] = line.trim().split(/\s+/);
    if (who === id && (role === "merge" || role === "docs")) return role;
  }
  return null;
}

function markerRole(push) {
  try {
    const value = readFileSync(path.resolve(push.cwd, git(push, ["rev-parse", "--git-dir"]).trim(), "makam-main-writer"), "utf8").trim();
    return value === "merge" || value === "docs" ? value : null;
  } catch {
    return null;
  }
}

/** Files the commits being pushed change, outside docs/, .scratch/ and the main-writers list: from where `src` forked off the remote `main` (three dots), renames counted as a delete and an add. */
function changedOutsideDocs(push, src) {
  if (!src) return ["(a deletion of main)"];
  try {
    git(push, ["rev-parse", "--verify", "-q", "origin/main"]);
  } catch {
    deny("there is no `origin/main` here to compare the push with. Run `git fetch origin main` and repeat the push.");
  }
  return git(push, ["diff", "--name-only", "--no-renames", `origin/main...${src}`])
    .split("\n")
    .filter((f) => f && !f.startsWith("docs/") && !f.startsWith(".scratch/") && f !== ".claude/main-writers");
}

/** CI runs gitleaks on `main` only, so a secret on a ticket branch would be published unscanned: scan before the push. */
function noSecrets(cwd) {
  const r = spawnSync("gitleaks", ["detect", "--source", ".", "--log-opts", "origin/main..HEAD", "--redact", "--no-banner"], {
    cwd,
    encoding: "utf8",
  });
  if (r.error?.code === "ENOENT") {
    notes.push(
      "guard-git: gitleaks is not installed here, so the outgoing commits were NOT scanned for secrets before this push (CI scans only `main`). " +
        "Check the diff yourself (`git diff origin/main..HEAD`) for keys, tokens and passwords before relying on it.",
    );
    return;
  }
  if (r.status !== 0) {
    deny(
      "gitleaks found a possible secret in the commits this push would send (or could not scan them). Output:\n" +
        `${(r.stdout + r.stderr).trim().slice(0, 1500)}\n` +
        "Remove the secret from the commits (a new commit does not remove it from history: amend or reset the unpushed commits), " +
        "rotate it if it was real; if the scan itself failed, `git fetch origin main` and push again; for a false positive, add the accepted finding with a reason to `.gitleaks.toml` and push again.",
    );
  }
}
