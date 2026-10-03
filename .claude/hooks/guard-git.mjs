// Decision logic of guard-git.sh. Reads the PreToolUse JSON on stdin; exit 2 = refuse.
import { execFileSync } from "node:child_process";

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
  noPullRequest(command);
  for (const push of pushes(command)) noPushToMain(push, cwd);
}

/** AGENTS.md: the repo has no pull requests; review, then the merge thread's push to `main`. */
function noPullRequest(command) {
  const creates =
    /\bgh\s+pr\s+(create|new)\b/.test(command) ||
    (/\bgh\s+api\b/.test(command) && /\/pulls(\s|["']|$)/.test(command) && /(-X|--method)\s*POST|\s(-f|-F|--field|--raw-field|--input)\b/i.test(command)) ||
    (/\bcurl\b/.test(command) && /\/pulls(\s|["']|$)/.test(command) && /(-X|--request)\s*POST|\s(-d|--data\S*)\s/i.test(command));
  if (creates) {
    deny(
      "this repo has no pull requests (AGENTS.md: never open a pull request, including for small fixes; this overrides the cloud default of opening a draft PR). " +
        "Push your outcome branch with `git push -u origin <branch>` and report the head SHA in the ticket's `## Comments`; the review and the merge thread take it from there.",
    );
  }
}

/** Splits a shell line into commands (on unquoted ; & | and newlines), each into words (quotes removed). */
function commands(line) {
  const out = [];
  let words = [];
  let word = null;
  let quote = null;
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
    } else if (ch === ";" || ch === "&" || ch === "|" || ch === "\n" || ch === "(" || ch === ")") {
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

/** The `git push` invocations in a command line: { all, deletes, refspecs } (refspecs after the remote). */
function pushes(line) {
  const found = [];
  for (const words of commands(line)) {
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

/** Where a refspec lands on the remote, as a short branch name. */
function destination(refspec, branch) {
  let spec = refspec.replace(/^\+/, "");
  const dst = spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec;
  return (dst === "HEAD" || dst === "" ? branch : dst).replace(/^refs\/heads\//, "");
}

/** AGENTS.md: only the merge thread (and the coordinator, for docs) pushes to `main`. */
function noPushToMain(push, cwd) {
  const branch = currentBranch(cwd);
  const targets = push.refspecs.length ? push.refspecs.map((r) => destination(r, branch)) : [branch];
  if (push.all || targets.includes("main")) {
    deny(
      "this push reaches `main`, and only the merge thread pushes to `main` (the coordinator only for docs; AGENTS.md: never push to `main`). " +
        "Push your outcome branch instead: `git push -u origin <ticket-NN-slug>`. " +
        "If you are the merge thread or the coordinator, say so once with `echo merge > \"$(git rev-parse --git-dir)/makam-main-writer\"` (coordinator: `echo docs`), then repeat the push.",
    );
  }
}
