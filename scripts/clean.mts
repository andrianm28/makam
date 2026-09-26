// npm run clean: frees what a worktree built or started, when its ticket is done.
//
// - build and test output: .next, dist, test-results, playwright-report, blob-report
// - its database on the shared test Postgres (makam-testpg), if that is running
// - its local Docker stacks (containers, volumes, the makam-v1:<project> image):
//   the one named after the worktree, and any other compose project started from
//   this directory; never a deployed environment's, never a shared image.
//
// node_modules stays (it is hard links into the shared store and costs little).
import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { dropDatabase, sharedTestPostgresUrl } from "../tests/support/shared-test-postgres";
import { stackProjectsToClean, testDatabaseName } from "../tests/support/worktree";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const worktree = path.basename(root);
const run = promisify(execFile);

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await run("docker", args, { cwd: root });
  return stdout.trim();
}

function lines(output: string): string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

for (const dir of [".next", "dist", "test-results", "playwright-report", "blob-report", "tsconfig.tsbuildinfo"]) {
  rmSync(path.join(root, dir), { recursive: true, force: true });
}
console.log("clean: removed .next, dist, test-results and reports");

const database = testDatabaseName(worktree);
try {
  await dropDatabase(sharedTestPostgresUrl(), database);
  console.log(`clean: dropped ${database} on the shared test Postgres`);
} catch {
  console.log("clean: shared test Postgres not reachable; no test database to drop");
}

const found = lines(
  await docker("ps", "-a", "--filter", `label=com.docker.compose.project.working_dir=${root}`, "--format", '{{.Label "com.docker.compose.project"}}'),
);
for (const project of stackProjectsToClean(worktree, found)) {
  const containers = lines(await docker("ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`));
  if (containers.length > 0) await docker("rm", "-f", "-v", ...containers);
  const volumes = lines(await docker("volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`));
  if (volumes.length > 0) await docker("volume", "rm", ...volumes);
  const networks = lines(await docker("network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`));
  if (networks.length > 0) await docker("network", "rm", ...networks);
  const images = lines(await docker("images", "-q", `makam-v1:${project}`));
  if (images.length > 0) await docker("image", "rm", `makam-v1:${project}`);
  if (containers.length + volumes.length + networks.length + images.length > 0) {
    console.log(`clean: removed stack ${project} (${containers.length} containers, ${volumes.length} volumes, ${images.length} images)`);
  }
}
console.log("clean: done");
