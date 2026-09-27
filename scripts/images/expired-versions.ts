/**
 * The ghcr versions that have outlived their age, for the monthly image
 * retention run (.github/workflows/image-retention.yml).
 *
 *   npx tsx scripts/images/expired-versions.ts <versions.json> <deployments.json>
 *
 * Reads two files `gh api` wrote: the container package's versions, and this
 * repository's deployments. Prints the version names to delete, one per line,
 * oldest first. The workflow deletes exactly those and nothing else.
 *
 * A version is only ever named when **every** tag on it is a `sha-<commit>` and
 * it is older than the age to keep and neither staging nor production is
 * running it. That one rule is what keeps a `v*` release tag (a version the
 * owner promoted, and the one a roll back names) and `latest` (the pointer the
 * staging timer follows) out of it, without a list of names to keep in step.
 * Anything the API answers that this cannot read is not a candidate, so a
 * changed or broken response deletes nothing.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { deployedDigest } from "../migrations/deployed-release";

const versionSchema = z.object({
  /** The manifest digest; this is what the delete API takes. */
  name: z.string(),
  created_at: z.string(),
  metadata: z
    .object({
      container: z.object({ tags: z.array(z.string()).optional() }).optional(),
    })
    .optional(),
});

/** `gh api --paginate` writes one array per page, so the file may hold several. */
const pagesSchema = z.union([z.array(versionSchema), z.array(z.array(versionSchema))]);

/** The only tag shape this will ever delete. */
const COMMIT_TAG = /^sha-[0-9a-f]{40}$/;

export type ExpiredOptions = {
  /** Digests an environment is running: deployedRelease's, without the repository. */
  keep: string[];
  now: Date;
  maxAgeDays: number;
};

/** The names of the versions to delete, oldest first. Nothing else, ever. */
export function expiredVersions(answer: unknown, options: ExpiredOptions): string[] {
  const pages = pagesSchema.safeParse(answer);
  if (!pages.success) return [];
  const versions = pages.data.flat();
  const keep = new Set(options.keep);
  const oldestFirst = new Date(options.now.getTime() - options.maxAgeDays * 24 * 60 * 60 * 1000);

  return versions
    .filter((version) => !keep.has(version.name))
    .filter((version) => {
      const tags = version.metadata?.container?.tags ?? [];
      // No tags at all, or one that is not a commit: not ours to delete.
      return tags.length > 0 && tags.every((tag) => COMMIT_TAG.test(tag));
    })
    .filter((version) => {
      const created = new Date(version.created_at);
      // An unreadable date is not an old version.
      if (Number.isNaN(created.getTime())) return false;
      return created < oldestFirst;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((version) => version.name);
}

/** The digests the given environments are running, from a Deployments API page. */
export function runningDigests(answer: unknown, environments: string[]): string[] {
  if (!Array.isArray(answer)) return [];
  return answer
    .filter(
      (deployment): deployment is Record<string, unknown> =>
        typeof deployment === "object" && deployment !== null && environments.includes(String(deployment.environment)),
    )
    .map(deployedDigest)
    .filter((digest) => digest !== "");
}

function readJson(file: string, what: string): unknown {
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`[retention] cannot read the ${what} from ${file}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 78;
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[retention] ${file} is not JSON (${error instanceof Error ? error.message : error}); deleting nothing`);
    process.exitCode = 78;
    return null;
  }
}

function main(): void {
  const [versionsFile, deploymentsFile] = process.argv.slice(2);
  if (!versionsFile || !deploymentsFile) {
    console.error("usage: expired-versions.ts <versions.json> <deployments.json>");
    process.exitCode = 64;
    return;
  }
  const versions = readJson(versionsFile, "package versions");
  const deployments = readJson(deploymentsFile, "deployments");
  if (versions === null || deployments === null) return;

  const maxAgeDays = Number(process.env.MAKAM_IMAGE_MAX_AGE_DAYS ?? "30");
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1) {
    console.error(`[retention] MAKAM_IMAGE_MAX_AGE_DAYS=${process.env.MAKAM_IMAGE_MAX_AGE_DAYS} is not a whole number of days`);
    process.exitCode = 64;
    return;
  }
  // The environments a deployed image may be running in. The owner promotes and
  // rolls back by hand, so these two names are the whole list.
  const environments = (process.env.MAKAM_IMAGE_ENVIRONMENTS ?? "staging,production").split(",");
  const keep = runningDigests(deployments, environments);
  console.error(
    `[retention] keeping the versions ${environments.join(" and ")} are running: ${keep.length === 0 ? "none recorded" : keep.join(", ")}`,
  );

  for (const name of expiredVersions(versions, { keep, now: new Date(), maxAgeDays })) {
    console.log(name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // No top-level await: this file is CommonJS to tsx (package.json has no
  // "type": "module"), and a promise here would be an unhandled rejection.
  main();
}
