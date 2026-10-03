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
