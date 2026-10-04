import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads a GitHub Actions workflow the way the tooling tests need it, without a
 * YAML dependency: the repository's workflows keep one regular shape (jobs at
 * two spaces, a job's keys at four, steps at six, a step's keys at eight), and
 * the reader throws on anything else, so a re-indented file fails loudly here
 * instead of reading as "no steps". A step's `run:` script can then be run for
 * real against fake executables (`runStep`), with the step's own `env:` (and its
 * job's) as the only environment it gets.
 */

const repo = fileURLToPath(new URL("../..", import.meta.url));

export interface Step {
  name: string;
  id?: string;
  uses?: string;
  if?: string;
  env: Record<string, string>;
  with: Record<string, string>;
  /** The `run:` script de-indented: exactly what the runner's shell is given. */
  run?: string;
  /** The step's own text (comments between steps included). */
  text: string;
}

export interface Job {
  id: string;
  /** The job's `if:` as written on its first line (`>-` for a folded condition). */
  if?: string;
  needs: string[];
  outputs: Record<string, string>;
  env: Record<string, string>;
  steps: Step[];
}

export interface Workflow {
  text: string;
  jobs: Job[];
  job(id: string): Job;
  step(jobId: string, name: string): Step;
}

const indentOf = (line: string) => line.length - line.trimStart().length;
/** A YAML scalar as written on one line: a trailing ` # comment` is not part of it, and quotes are not either. */
const unquote = (value: string) => {
  const trimmed = value.trim();
  const quoted = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed.replace(/\s+#.*$/, "");
};

/** The `KEY: value` lines one level under `key:` (itself at `indent`). */
function mapUnder(lines: string[], key: string, indent: number): Record<string, string> {
  const at = lines.findIndex((line) => line === `${" ".repeat(indent)}${key}:`);
  if (at < 0) return {};
  const out: Record<string, string> = {};
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= indent) break;
    const entry = /^\s*([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (entry && indentOf(line) === indent + 2) out[entry[1]] = unquote(entry[2] ?? "");
  }
  return out;
}

/** The single-line value of `key:` at `indent`, or undefined. */
function scalarAt(lines: string[], key: string, indent: number): string | undefined {
  const prefix = `${" ".repeat(indent)}${key}:`;
  const line = lines.find((l) => l.startsWith(`${prefix} `));
  return line === undefined ? undefined : unquote(line.slice(prefix.length));
}

function runOf(lines: string[]): string | undefined {
  const at = lines.findIndex((line) => /^ +(- )?run:( |$)/.test(line));
  if (at < 0) return undefined;
  const match = /^( +)(- )?run:\s*(.*)$/.exec(lines[at])!;
  const keyIndent = match[1].length + (match[2] ? 2 : 0);
  const rest = match[3];
  if (!/^[|>][+-]?$/.test(rest)) return rest;
  const body: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== "" && indentOf(line) <= keyIndent) break;
    body.push(line.slice(Math.min(keyIndent + 2, indentOf(line) || keyIndent + 2)));
  }
  while (body.length && body[body.length - 1].trim() === "") body.pop();
  return `${body.join("\n")}\n`;
}

function parseStep(lines: string[]): Step {
  const first = lines[0].replace(/^ {6}- /, "        ");
  const own = [first, ...lines.slice(1)];
  const name = scalarAt(own, "name", 8);
  const uses = scalarAt(own, "uses", 8);
  const run = runOf(lines);
  return {
    name: name ?? (uses ? `uses ${uses}` : "run"),
    id: scalarAt(own, "id", 8),
    uses,
    if: scalarAt(own, "if", 8),
    env: mapUnder(own, "env", 8),
    with: mapUnder(own, "with", 8),
    run,
    text: lines.join("\n"),
  };
}

function parseJob(id: string, lines: string[]): Job {
  const stepsAt = lines.findIndex((line) => line === "    steps:");
  if (stepsAt < 0) throw new Error(`job ${id} has no steps: the workflow reader expects "    steps:" at four spaces`);
  const header = lines.slice(0, stepsAt);
  const groups: string[][] = [];
  for (const line of lines.slice(stepsAt + 1)) {
    if (/^ {6}- /.test(line)) groups.push([line]);
    else if (groups.length) groups[groups.length - 1].push(line);
    else if (line.trim() !== "" && !line.trim().startsWith("#")) throw new Error(`job ${id}: ${JSON.stringify(line)} is not a step`);
  }
  const needsText = scalarAt(header, "needs", 4) ?? "";
  return {
    id,
    if: scalarAt(header, "if", 4),
    needs: needsText.replace(/[[\]]/g, "").split(",").map((n) => n.trim()).filter(Boolean),
    outputs: mapUnder(header, "outputs", 4),
    env: mapUnder(header, "env", 4),
    steps: groups.map(parseStep),
  };
}

export function parseWorkflow(text: string): Workflow {
  const lines = text.split("\n");
  const jobsAt = lines.indexOf("jobs:");
  if (jobsAt < 0) throw new Error("no top-level jobs:");
  const jobs: Job[] = [];
  let current: { id: string; lines: string[] } | undefined;
  for (const line of lines.slice(jobsAt + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      if (current) jobs.push(parseJob(current.id, current.lines));
      current = { id: header[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) jobs.push(parseJob(current.id, current.lines));
  const job = (id: string) => {
    const found = jobs.find((j) => j.id === id);
    if (!found) throw new Error(`no job ${id}`);
    return found;
  };
  return {
    text,
    jobs,
    job,
    step: (jobId, name) => {
      const found = job(jobId).steps.find((s) => s.name === name);
      if (!found) throw new Error(`job ${jobId} has no step named "${name}"`);
      return found;
    },
  };
}

export function readWorkflow(file: string): Workflow {
  return parseWorkflow(readFileSync(path.join(repo, ".github/workflows", file), "utf8"));
}

/** Every `${{ expression }}` of `value`, replaced from `context`; an expression the test does not know is an error. */
export function expand(value: string, context: Record<string, string>): string {
  return value.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_, expression: string) => {
    if (!(expression in context)) throw new Error(`the test gives no value for \${{ ${expression} }}`);
    return context[expression];
  });
}

const sandboxes: string[] = [];

export function cleanSandboxes() {
  while (sandboxes.length) rmSync(sandboxes.pop()!, { recursive: true, force: true });
}

export interface RunOptions {
  /** The values of the `${{ }}` expressions the step's env uses. */
  context?: Record<string, string>;
  /** Extra environment variables (the workflow's own, e.g. a variable GitHub sets on the runner). */
  env?: Record<string, string>;
  /** Executables placed in front of PATH: name to bash body (they log their call to `calls`). */
  bins?: Record<string, string>;
  /** Files written under `$SANDBOX/fixtures`, for the fake executables to answer from. */
  fixtures?: Record<string, string>;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** One line per call of a fake executable: `<name> <args>`. */
  calls: string[];
  /** What the fake `gh` read on stdin (`--input -`), one entry per call. */
  stdins: string[];
  /** What the script wrote to `$GITHUB_OUTPUT`. */
  outputs: Record<string, string>;
  /** What the script wrote to `$GITHUB_STEP_SUMMARY`. */
  summary: string;
}

/** A script run the way GitHub runs `shell: bash`, with the runner's own variables and fake executables. */
export function runScript(script: string, env: Record<string, string>, options: RunOptions = {}): RunResult {
  const root = mkdtempSync(path.join(tmpdir(), "makam-workflow-"));
  sandboxes.push(root);
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  mkdirSync(path.join(root, "fixtures"));
  mkdirSync(path.join(root, "tmp"));
  for (const [name, body] of Object.entries(options.bins ?? {})) {
    const file = path.join(bin, name);
    writeFileSync(file, `#!/usr/bin/env bash\necho "${name} $*" >> "$SANDBOX/calls.log"\n${body}\n`);
    chmodSync(file, 0o755);
  }
  for (const [name, content] of Object.entries(options.fixtures ?? {})) writeFileSync(path.join(root, "fixtures", name), content);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    encoding: "utf8",
    cwd: root,
    // A clean environment on purpose: a GH_TOKEN or GH_REPO in the developer's shell must not hide a step that forgot its own.
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH}`,
      HOME: root,
      SANDBOX: root,
      RUNNER_TEMP: path.join(root, "tmp"),
      GITHUB_OUTPUT: path.join(root, "output"),
      GITHUB_STEP_SUMMARY: path.join(root, "summary"),
      GITHUB_REPOSITORY: "o/r",
      GITHUB_ACTOR: "o",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_RUN_ID: "1",
      GITHUB_SHA: "f".repeat(40),
      ...env,
      ...options.env,
    },
  });
  const read = (file: string) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : "");
  const outputs: Record<string, string> = {};
  for (const line of read("output").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) outputs[line.slice(0, at)] = line.slice(at + 1);
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: read("calls.log").split("\n").filter(Boolean),
    stdins: readdirSync(root)
      .filter((name) => name.startsWith("stdin-"))
      .sort()
      .map((name) => read(name)),
    outputs,
    summary: read("summary"),
  };
}

/** Runs one step of a workflow: its script, with its job's and its own `env:` expanded from `options.context`. */
export function runStep(workflow: Workflow, jobId: string, name: string, options: RunOptions = {}): RunResult {
  const step = workflow.step(jobId, name);
  if (step.run === undefined) throw new Error(`step "${name}" has no run: script`);
  const context = options.context ?? {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...workflow.job(jobId).env, ...step.env })) env[key] = expand(value, context);
  return runScript(step.run, env, options);
}

/**
 * A fake `gh` that behaves like the real one where it matters to these workflows:
 * it needs GH_TOKEN, and it needs GH_REPO (the steps with no checkout have no
 * repository to infer), and says so the way gh does. It answers from files in
 * `$SANDBOX/fixtures`, applies `--jq` with the real jq (so a step's own filter is
 * what is tested), and records the body it was given on stdin (`--input -`).
 */
export const fakeGh = String.raw`
fix="$SANDBOX/fixtures"
if [ -z "\${GH_REPO:-}" ]; then
  echo "failed to determine base repo: no git remotes found (set the GH_REPO environment variable)" >&2
  exit 1
fi
if [ -z "\${GH_TOKEN:-}" ]; then
  echo "gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable." >&2
  exit 4
fi
all="$*"
expr=""; prev=""
for a in "$@"; do
  if [ "$prev" = "--jq" ]; then expr=$a; fi
  prev=$a
done
emit() {
  if [ ! -f "$fix/$1" ]; then echo "gh: the test has no fixture $1 for: $all" >&2; exit 1; fi
  if [ -n "$expr" ]; then jq -r "$expr" < "$fix/$1"; else cat "$fix/$1"; fi
}
case "$all" in *"--input -"*) n=$(find "$SANDBOX" -maxdepth 1 -name 'stdin-*' | wc -l); cat > "$SANDBOX/stdin-$(printf '%03d' "$n").json" ;; esac
case "$1 $2" in
  "release list") emit release-list.json ;;
  "release view")
    if [ -f "$fix/release-view-$3.json" ]; then emit "release-view-$3.json"; exit 0; fi
    if [ -f "$fix/release-view-error.txt" ]; then cat "$fix/release-view-error.txt" >&2; exit 1; fi
    echo "release not found" >&2; exit 1 ;;
  "api "*)
    method=GET
    case "$all" in *"--method POST"*) method=POST ;; *"--method PATCH"*) method=PATCH ;; esac
    if [ "$method" = GET ]; then
      case "$all" in
        *"/statuses"*) emit statuses.json ;;
        *"/deployments?"*) emit deployments.json ;;
        *"/releases?"*) emit releases.json ;;
        *) echo "gh: the test has no route for: $all" >&2; exit 1 ;;
      esac
    else
      case "$all" in
        *"/releases/generate-notes"*) emit generate-notes.json ;;
        *"/releases/"[0-9]*) echo '{}' ;;
        *"/releases"*) emit created-release.json ;;
        *"/statuses"*) echo '{}' ;;
        *"/deployments"*) echo '{"id":4242}' | { if [ -n "$expr" ]; then jq -r "$expr"; else cat; fi; } ;;
        *) echo "gh: the test has no route for: $all" >&2; exit 1 ;;
      esac
    fi ;;
  *) echo "gh: the test has no answer for: $all" >&2; exit 1 ;;
esac
`.replace(/\\\$/g, "$");
