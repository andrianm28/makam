// npm run stack -- <docker compose args>   this worktree's own local stack
// npm run stack                              prints its compose project name
//
// Runs docker-compose.yml as the worktree's own project (never the shared
// makam-v1-dev) and labels the image it builds, so `npm run clean` can prove
// what came from this worktree. Example: npm run stack -- up --build -d
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stackProjectName } from "./lib/worktree";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const project = stackProjectName(root);
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(project);
} else {
  const result = spawnSync("docker", ["compose", "-p", project, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, COMPOSE_PROJECT_NAME: project, MAKAM_WORKTREE: root },
  });
  process.exit(result.status ?? 1);
}
