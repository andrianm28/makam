// npm run clean: frees what a worktree built or started, when its ticket is done.
//
// - build and test output: .next, dist, test-results, playwright-report, blob-report
// - its database on the shared test Postgres (makam-testpg), if that is running
// - its local Docker stacks: only containers, volumes, networks and makam-v1:*
//   image tags proven to come from this worktree (see planStackCleanup); never
//   makam-v1-dev, a deployed environment, or a project also used elsewhere.
// - a volume, network or image that is still in use is reported and left, not
//   fatal; a database error other than "not reachable" is reported too.
//
// node_modules stays (it is hard links into the shared store and costs little).
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docker, isDaemonDown, lines, removeEach } from "./lib/docker";
import { planStackCleanup, testDatabaseName, type DockerInventory } from "./lib/worktree";
import { dropDatabase, isDbUnreachable, sharedTestPostgresUrl } from "../tests/support/shared-test-postgres";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const dir of [".next", "dist", "test-results", "playwright-report", "blob-report", "tsconfig.tsbuildinfo"]) {
  rmSync(path.join(root, dir), { recursive: true, force: true });
}
console.log("clean: removed .next, dist, test-results and reports");

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Everything clean could not free; reported in the summary at the end. */
const leftBehind: string[] = [];

const database = testDatabaseName(root);
try {
  await dropDatabase(sharedTestPostgresUrl(), database);
  console.log(`clean: dropped ${database} on the shared test Postgres (if it was there)`);
} catch (error) {
  if (isDbUnreachable(error)) {
    console.log("clean: shared test Postgres not reachable; no test database to drop");
  } else {
    leftBehind.push(`database ${database}`);
    console.log(`clean: could not drop ${database}: ${messageOf(error)}`);
  }
}

const PROJECT = '{{.Label "com.docker.compose.project"}}';
// Only the built image carries makam.worktree; on containers, volumes and
// networks this is always empty (see planStackCleanup).
const WORKTREE = '{{.Label "makam.worktree"}}';

function parse(output: string) {
  return lines(output).map((line) => {
    const [id, project, worktree, workingDir] = line.split("\t");
    return { id, project: project || undefined, worktree: worktree || undefined, workingDir: workingDir || undefined };
  });
}

let inventory: DockerInventory | undefined;
try {
  const tags = lines(await docker(["images", "makam-v1", "--format", "{{.Repository}}:{{.Tag}}"])).filter(
    (tag) => !tag.endsWith(":<none>"),
  );
  inventory = {
    containers: parse(
      await docker(["ps", "-a", "--format", `{{.ID}}\t${PROJECT}\t${WORKTREE}\t{{.Label "com.docker.compose.project.working_dir"}}`]),
    ),
    volumes: parse(await docker(["volume", "ls", "--format", `{{.Name}}\t${PROJECT}\t${WORKTREE}`])),
    networks: parse(await docker(["network", "ls", "--format", `{{.ID}}\t${PROJECT}\t${WORKTREE}`])),
    images: await Promise.all(
      tags.map(async (tag) => {
        const [project, worktree] = (
          await docker(["image", "inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}\t{{index .Config.Labels "makam.worktree"}}', tag])
        ).split("\t");
        return { id: tag, project: project || undefined, worktree: worktree || undefined };
      }),
    ),
  };
} catch (error) {
  if (!isDaemonDown(error)) throw error;
  console.log("clean: no stack reachable (the Docker daemon is down); leaving containers, volumes, networks and images alone");
}

if (inventory) {
  const plan = planStackCleanup(root, inventory);
  if (plan.containers.length > 0) await docker(["rm", "-f", "-v", ...plan.containers]);
  const volumes = await removeEach(plan.volumes, (id) => docker(["volume", "rm", id]));
  const networks = await removeEach(plan.networks, (id) => docker(["network", "rm", id]));
  const images = await removeEach(plan.images, (id) => docker(["image", "rm", id]));
  for (const failure of [...volumes.failed, ...networks.failed, ...images.failed]) {
    leftBehind.push(failure.id);
    console.log(`clean: could not remove ${failure.id}: ${messageOf(failure.error)}`);
  }
  console.log(
    `clean: removed ${plan.containers.length} containers, ${volumes.removed.length} volumes, ${networks.removed.length} networks, ${images.removed.length} images (${images.removed.join(", ") || "none"})`,
  );
  for (const project of plan.skipped) {
    console.log(`clean: left ${project} alone (shared or used elsewhere); stop your part of it by hand if you started it`);
  }
}

if (leftBehind.length > 0) {
  console.log(`clean: left behind: ${leftBehind.join(", ")}`);
  process.exit(1);
}
console.log("clean: done");
