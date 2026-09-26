import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Names derived from a worktree's root directory, so the shared test Postgres
 * and the local Docker stacks never mix one worktree's data with another's:
 * the directory name for people, a hash of the absolute path so two worktrees
 * can never share a name.
 */

const POSTGRES_MAX_IDENTIFIER = 63;
const COMPOSE_MAX_PROJECT = 50;

function name(prefix: string, root: string, separator: "_" | "-", max: number): string {
  const words = path.basename(root).toLowerCase().match(/[a-z0-9]+/g) ?? ["worktree"];
  const hash = createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 8);
  const base = `${prefix}${separator}${words.join(separator)}`.slice(0, max - hash.length - 1);
  return `${base}${separator}${hash}`;
}

/** The test database this worktree owns on the shared test Postgres. */
export function testDatabaseName(root: string): string {
  return name("makam_test", root, "_", POSTGRES_MAX_IDENTIFIER);
}

/** The compose project (`npm run stack`) for this worktree's local stack. */
export function stackProjectName(root: string): string {
  return name("makam", root, "-", COMPOSE_MAX_PROJECT);
}

/**
 * Compose projects `npm run clean` never touches: the deployed environments on
 * the shared host, and `makam-v1-dev`, which any checkout joins with a plain
 * `docker compose up` (docker-compose.yml names it).
 */
const PROTECTED = /^(makam-v1-dev|makam-(staging|prod|nonprod)(-.*)?|glitchtip)$/;

type Labelled = {
  id: string;
  /** com.docker.compose.project */
  project?: string;
  /** makam.worktree, set by `npm run stack` */
  worktree?: string;
};

export type DockerInventory = {
  /** workingDir: com.docker.compose.project.working_dir */
  containers: (Labelled & { workingDir?: string })[];
  volumes: Labelled[];
  networks: Labelled[];
  /** Images tagged makam-v1:*; id is the tag. */
  images: Labelled[];
};

export type StackCleanupPlan = {
  containers: string[];
  volumes: string[];
  networks: string[];
  images: string[];
  /** Projects started from this worktree that clean leaves alone (shared or protected). */
  skipped: string[];
};

/**
 * What `npm run clean` removes: only stacks proven to come from this worktree,
 * by the compose working_dir label on their containers or the makam.worktree
 * label `npm run stack` puts on containers, volumes, networks and the image;
 * never a protected project, never one also used from another directory.
 */
export function planStackCleanup(root: string, inventory: DockerInventory): StackCleanupPlan {
  const fromHere = (item: Labelled & { workingDir?: string }) => item.workingDir === root || item.worktree === root;
  const usedElsewhere = new Set(
    inventory.containers.filter((c) => c.project && !fromHere(c)).map((c) => c.project as string),
  );
  const startedHere = new Set(inventory.containers.filter(fromHere).map((c) => c.project).filter(Boolean) as string[]);

  const removable = (project: string | undefined): project is string =>
    Boolean(project) && !PROTECTED.test(project as string) && !usedElsewhere.has(project as string);
  const owned = (item: Labelled & { workingDir?: string }) =>
    removable(item.project) && (fromHere(item) || startedHere.has(item.project));

  return {
    containers: inventory.containers.filter(owned).map((c) => c.id),
    volumes: inventory.volumes.filter(owned).map((v) => v.id),
    networks: inventory.networks.filter(owned).map((n) => n.id),
    images: inventory.images.filter(owned).map((i) => i.id),
    skipped: [...startedHere].filter((project) => !removable(project)).sort(),
  };
}
