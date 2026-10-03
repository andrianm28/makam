// Decision logic of guard-git.sh. Reads the PreToolUse JSON on stdin; exit 2 = refuse.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function deny(message) {
  process.stderr.write(`guard-git: ${message}\n`);
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  try {
    decide(raw);
  } catch (e) {
    deny(`could not decide (${e?.message ?? e}); refusing the command (fail-closed). Run it from a plain shell step without chaining, or ask the owner.`);
  }
});

function decide(text) {
  const input = JSON.parse(text);
  const command = input?.tool_input?.command;
  if (typeof command !== "string") deny("no command in the tool input; refusing (fail-closed).");
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  for (const words of commands(command)) noPullRequest(words);
  const sent = pushes(command);
  for (const push of sent) noPushToMain(push, cwd);
  if (sent.length) noSecrets(cwd);
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
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words = words.slice(1); // FOO=1 gh ...
  const [tool, ...rest] = words;
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
function pushes(line) {
  const found = [];
  for (const raw of commands(line)) {
    const words = withoutRedirects(raw);
    let i = words.indexOf("git");
    if (i < 0) continue;
    // Skip git's own options (-C dir, -c k=v, --git-dir=...) up to the subcommand.
    for (i++; i < words.length && words[i].startsWith("-"); i++) if (["-C", "-c"].includes(words[i])) i++;
    if (words[i] !== "push") continue;
    const push = { all: false, deletes: false, refspecs: [] };
    const positional = [];
    for (i++; i < words.length; i++) {
      const w = words[i];
      if (PUSH_FLAGS_WITH_VALUE.has(w)) i++;
      else if (w === "--all" || w === "--mirror") push.all = true;
      else if (w === "--delete" || w === "-d") push.deletes = true;
      else if (!w.startsWith("-")) positional.push(w);
    }
    push.refspecs = positional.slice(1); // the first positional is the remote
    found.push(push);
  }
  return found;
}

function currentBranch(cwd) {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
function noPushToMain(push, cwd) {
  const branch = currentBranch(cwd);
  const specs = push.refspecs.length ? push.refspecs.map((r) => parseRefspec(r, branch)) : [{ src: "HEAD", dst: branch }];
  const toMain = specs.filter((x) => x.dst === "main");
  if (push.all || toMain.length) {
    const writer = mainWriter(cwd);
    if (writer === "merge") return;
    if (writer === "docs") {
      const outside = toMain.flatMap((x) => changedOutsideDocs(cwd, x.src));
      if (!outside.length) return;
      deny(
        `you are marked as the coordinator, who may push only docs to \`main\` (docs/ and .scratch/), but the commits this push sends also change: ${outside.slice(0, 5).join(", ")}. ` +
          "Move those changes to a ticket branch (`git push origin HEAD:ticket-NN-slug`) for the review and the merge thread.",
      );
    }
    deny(
      "this push reaches `main`, and only the merge thread pushes to `main` (the coordinator only for docs; AGENTS.md: never push to `main`). " +
        "Push your outcome branch instead: `git push -u origin <ticket-NN-slug>`. " +
        "If you are the merge thread or the coordinator, say so once with `echo merge > \"$(git rev-parse --git-dir)/makam-main-writer\"` (coordinator: `echo docs`), then repeat the push.",
    );
  }
}

/** Who the session says it is: `merge` (the merge thread) or `docs` (the coordinator), from a marker in the git dir. */
function mainWriter(cwd) {
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf8" }).trim();
    const value = readFileSync(path.resolve(cwd, gitDir, "makam-main-writer"), "utf8").trim();
    return value === "merge" || value === "docs" ? value : null;
  } catch {
    return null;
  }
}

/** Files the commits being pushed change, outside docs/ and .scratch/: from where `src` forked off the remote `main` (three dots), renames counted as a delete and an add. */
function changedOutsideDocs(cwd, src) {
  if (!src) return ["(a deletion of main)"];
  try {
    execFileSync("git", ["rev-parse", "--verify", "-q", "origin/main"], { cwd, stdio: "ignore" });
  } catch {
    deny("there is no `origin/main` here to compare the push with. Run `git fetch origin main` and repeat the push.");
  }
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", `origin/main...${src}`], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  return files.filter((f) => !f.startsWith("docs/") && !f.startsWith(".scratch/"));
}

/** CI runs gitleaks on `main` only, so a secret on a ticket branch would be published unscanned: scan before the push. */
function noSecrets(cwd) {
  const r = spawnSync("gitleaks", ["detect", "--source", ".", "--log-opts", "origin/main..HEAD", "--redact", "--no-banner"], {
    cwd,
    encoding: "utf8",
  });
  if (r.error?.code === "ENOENT") {
    const note =
      "guard-git: gitleaks is not installed here, so the outgoing commits were NOT scanned for secrets before this push (CI scans only `main`). " +
      "Check the diff yourself (`git diff origin/main..HEAD`) for keys, tokens and passwords before relying on it.";
    process.stderr.write(`${note}\n`);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: note } }));
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
