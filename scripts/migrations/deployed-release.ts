/**
 * The image digest the migration upgrade test starts from.
 *
 * Deploys follow signed digests and production lags staging, so the baseline is
 * whatever the newest **successful** deployment says is running in production,
 * then staging, and only then the ghcr `latest` tag. A host that has never
 * deployed has no baseline at all, and that is not an error: there is nothing to
 * upgrade from yet. A deployment that did not succeed is not a baseline either:
 * the newest deployment of an environment is often a refused or rolled-back
 * attempt, and upgrading from an image that never ran healthy is not what
 * production runs.
 *
 *   npx tsx scripts/migrations/deployed-release.ts <owner/repo> < deployment.json
 *
 * Reads one GitHub deployment object (the Deployments API, as `gh api` prints
 * it) on stdin and prints `ghcr.io/<owner>/<repo>@sha256:<digest>`, or nothing
 * when the deployment did not succeed, does not name a digest, or is absent.
 */
import { z } from "zod";

const deploymentSchema = z.object({
  /** GitHub's own verdict on the deployment: success, failure, error, in_progress, pending, inactive. */
  state: z.string().optional(),
  payload: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
});

/**
 * The image digest a deployment put into an environment, or "" when that
 * deployment is not something an environment is running: it did not succeed, or
 * it names no digest. This is the form image retention in ghcr keeps
 * (scripts/images/expired-versions.ts) and the form the migration upgrade test
 * starts from.
 */
export function deployedDigest(deployment: unknown): string {
  const parsed = deploymentSchema.safeParse(deployment);
  if (!parsed.success) return "";
  // Only a deployment that succeeded: see the note above.
  if (parsed.data.state !== "success") return "";
  const payload = parsed.data.payload;
  if (typeof payload !== "object" || payload === null) return "";
  const digest = payload.image_digest;
  if (typeof digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(digest)) return "";
  return digest;
}

/** The full image reference the running release was deployed as, or "" when unknown. */
export function deployedRelease(deployment: unknown, repository: string): string {
  const digest = deployedDigest(deployment);
  return digest === "" ? "" : `ghcr.io/${repository}@${digest}`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const repository = process.argv[2] ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    console.error("usage: deployed-release.ts <owner/repo> < deployment.json");
    process.exitCode = 64;
    return;
  }
  const raw = await readStdin();
  if (raw.trim() === "") {
    console.error("[upgrade] no deployment given: there is no running release to upgrade from yet");
    return;
  }
  const reference = deployedRelease(JSON.parse(raw), repository);
  if (reference === "") {
    console.error("[upgrade] that deployment did not succeed, or names no image digest; looking further back");
    return;
  }
  console.log(reference);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // No top-level await: tsx runs this as CommonJS (package.json has no
  // "type": "module"), where that is a transform error, so the script used to
  // always fail and ci.yml's "|| true" quietly fell back to the ghcr :latest
  // tag. main() is still async because it reads stdin.
  main().catch((error: unknown) => {
    console.error(`[upgrade] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
