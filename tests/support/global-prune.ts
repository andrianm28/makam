/**
 * The rule a shared host cannot survive breaking: no cleanup that reaches
 * beyond makam's own objects (ticket 73).
 *
 * A `docker system prune`, `image prune`, `volume prune`, `network prune` or
 * `builder prune` — and any `-a` / `--all` form of them — deletes every image,
 * volume and network on the host whose name the command does not filter, so on
 * a machine running other projects it deletes their work. The only cleanups
 * allowed here are selective ones: an image by tag (`docker image rm <tag>`), a
 * volume or network by name, each proved to come from this worktree or this
 * environment first (`scripts/clean.mts`, `deploy/bin/makam-prune-images`).
 *
 * What is checked, precisely: every file git tracks that could run a command —
 * an executable whatever its name, a source file, a workflow, a compose file,
 * a package manifest. Documentation is not checked, because prose that names a
 * prune runs nothing, and the runbook and AGENTS.md have to be able to say
 * these words are forbidden.
 */
export type ScannableFile = {
  /** Path as git knows it, e.g. `deploy/bin/makam-prune-images`. */
  path: string;
  /** Git's mode: `100755` for an executable, `100644` otherwise. */
  mode: string;
  text: string;
};

/** Directories that hold no tracked source and must never be walked. */
const NOT_SOURCE = /^(node_modules|\.next|dist|test-results|playwright-report|blob-report|coverage)\//;

/** Documentation and lock files: they cannot run a command. */
const NOT_EXECUTABLE = /\.(md|mdx|txt|lock|log)$|(^|\/)package-lock\.json$/;

/** A file that can run a command: an executable, or one of these suffixes. */
const EXECUTABLE_SUFFIX = /\.(sh|bash|ts|tsx|mts|cts|mjs|cjs|js|jsx|ya?ml|json|toml)$/;

/**
 * `docker <object> prune`, and a bare `prune -a`. The command has to be the
 * thing the line runs, so a comment or a quoted example is not a match (see
 * codeOnly). The flags come along in the report: `-a` and `--volumes` are the
 * part that makes a cleanup reach everything.
 */
const PRUNE = [
  /docker\s+(?:system|image|volume|network|builder|container|buildx)\s+prune(?:\s+-{1,2}[\w-]+)*/,
  /\bprune\s+(-[a-zA-Z]*a|--all)\b/,
];

/**
 * Everything a comment can be in the languages here: `#` to the end of the
 * line, `//` and `/* ... *\/` blocks. Stripping more than a real parser would
 * can only hide a match in a string, which cannot run a prune either; missing a
 * real one is the direction that matters, and the patterns still match the
 * command wherever it is left on a line.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/(^|\s)#[^\n]*/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Every global prune in this file, as `<path>[:<line>]: <command>`. */
export function globalPrunes(file: ScannableFile): string[] {
  if (NOT_SOURCE.test(file.path)) return [];
  if (NOT_EXECUTABLE.test(file.path) && !file.mode.startsWith("100755")) return [];
  if (!file.mode.startsWith("100755") && !EXECUTABLE_SUFFIX.test(file.path)) return [];

  const found: string[] = [];
  codeOnly(file.text)
    .split("\n")
    .forEach((line, index) => {
      for (const pattern of PRUNE) {
        const match = pattern.exec(line);
        if (match) {
          found.push(`${file.path}:${index + 1}: ${match[0].trim()}`);
          return;
        }
      }
    });
  return found;
}
