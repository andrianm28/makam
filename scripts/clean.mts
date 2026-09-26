// npm run clean: frees what a worktree built or started, when its ticket is done.
//
// - build and test output: .next, dist, test-results, playwright-report, blob-report
// - its database on the shared test Postgres (makam-testpg), if that is running
// - its local Docker stacks: only containers, volumes, networks and makam-v1:*
//   image tags proven to come from this worktree (see planStackCleanup); never
//   makam-v1-dev, a deployed environment, or a project also used elsewhere.
//
// node_modules stays (it is hard links into the shared store and costs little).
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docker, lines } from "./lib/docker";
import { planStackCleanup, testDatabaseName, type DockerInventory } from "./lib/worktree";
import { dropDatabase, sharedTestPostgresUrl } from "../tests/support/shared-test-postgres";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const dir of [".next", "dist", "test-results", "playwright-report", "blob-report", "tsconfig.tsbuildinfo"]) {
  rmSync(path.join(root, dir), { recursive: true, force: true });
}
console.log("clean: removed .next, dist, test-results and reports");

const database = testDatabaseName(root);
try {
  await dropDatabase(sharedTestPostgresUrl(), database);
  console.log(`clean: dropped ${database} on the shared test Postgres (if it was there)`);
} catch {
  console.log("clean: shared test Postgres not reachable; no test database to drop");
}

const PROJECT = '{{.Label "com.docker.compose.project"}}';
const WORKTREE = '{{.Label "makam.worktree"}}';

function parse(output: string) {
  return lines(output).map((line) => {
    const [id, project, worktree, workingDir] = line.split("\t");
    return { id, project: project || undefined, worktree: worktree || undefined, workingDir: workingDir || undefined };
  });
}

const tags = lines(await docker(["images", "makam-v1", "--format", "{{.Repository}}:{{.Tag}}"])).filter((tag) => !tag.endsWith(":<none>"));
const inventory: DockerInventory = {
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

const plan = planStackCleanup(root, inventory);
if (plan.containers.length > 0) await docker(["rm", "-f", "-v", ...plan.containers]);
if (plan.volumes.length > 0) await docker(["volume", "rm", ...plan.volumes]);
if (plan.networks.length > 0) await docker(["network", "rm", ...plan.networks]);
if (plan.images.length > 0) await docker(["image", "rm", ...plan.images]);
console.log(
  `clean: removed ${plan.containers.length} containers, ${plan.volumes.length} volumes, ${plan.networks.length} networks, ${plan.images.length} images (${plan.images.join(", ") || "none"})`,
);
for (const project of plan.skipped) {
  console.log(`clean: left ${project} alone (shared or used elsewhere); stop your part of it by hand if you started it`);
}
console.log("clean: done");
