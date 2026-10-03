import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fakeBin, runHook, tmpDir } from "../support/hook";

const dirs: string[] = [];
afterEach(() => cleanup(dirs));

/** A cloud clone with `node_modules` already present and a fake `npm` that records its calls. */
function cloud(lock: string, installedHash?: string) {
  const project = tmpDir("ss-proj-", dirs);
  writeFileSync(path.join(project, "package-lock.json"), lock);
  mkdirSync(path.join(project, "node_modules"));
  if (installedHash !== undefined) writeFileSync(path.join(project, "node_modules/.makam-lock-hash"), installedHash);
  const bin = fakeBin(tmpDir("ss-bin-", dirs), { npm: {} });
  const run = () =>
    runHook("session-start.sh", {}, { cwd: project, path: `${bin}:/usr/bin:/bin`, env: { CLAUDE_CODE_REMOTE: "true" } });
  const npmCalls = () => (existsSync(`${bin}/npm.calls`) ? readFileSync(`${bin}/npm.calls`, "utf8") : "");
  return { project, run, npmCalls };
}

describe("session-start hook, dependencies", () => {
  it("reinstalls from the lockfile when the installed node_modules came from a different lockfile", () => {
    const c = cloud('{"lock":"new"}', "hash-of-an-older-lockfile");
    expect(c.run().status).toBe(0);
    expect(c.npmCalls()).toMatch(/^ci\b/);
  });
});
