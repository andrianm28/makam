import { describe, expect, it } from "vitest";
import { isDaemonDown, removeEach } from "../../scripts/lib/docker";
import { isDbUnreachable } from "../support/shared-test-postgres";

describe("clean's Docker daemon check", () => {
  it("reports a daemon that is down as no stack reachable", () => {
    expect(
      isDaemonDown(
        new Error(
          "docker ps failed: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
        ),
      ),
    ).toBe(true);
    expect(
      isDaemonDown(new Error("Got permission denied while trying to connect to the Docker daemon socket")),
    ).toBe(true);
  });

  it("does not mistake a missing object for a daemon that is down", () => {
    expect(isDaemonDown(new Error("docker rm failed: No such container: abc"))).toBe(false);
    expect(isDaemonDown(new Error("docker volume rm failed: No such volume: pgdata"))).toBe(false);
  });
});

describe("clean's per-object removal", () => {
  it("keeps going past a failure and reports what was left behind", async () => {
    const calls: string[] = [];
    const result = await removeEach(["a", "b", "c"], async (id) => {
      calls.push(id);
      if (id === "b") throw new Error("in use");
    });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(result.removed).toEqual(["a", "c"]);
    expect(result.failed.map((failure) => failure.id)).toEqual(["b"]);
  });
});

describe("clean's database-drop check", () => {
  it("treats only an unreachable server as nothing to drop", () => {
    expect(isDbUnreachable(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:55432"), { code: "ECONNREFUSED" }))).toBe(
      true,
    );
    expect(
      isDbUnreachable(Object.assign(new Error('password authentication failed for user "makam"'), { code: "28P01" })),
    ).toBe(false);
  });
});
