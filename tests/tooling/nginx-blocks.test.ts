import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The nginx blocks are the first thing a payment webhook meets. The route the
// app serves is /api/webhooks/pembayaran (src/app/api/webhooks/pembayaran); a
// block that names another path leaves the real one behind whatever else the
// block does, so the paths are read off the block files.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");

describe("the staging block", () => {
  const block = read("deploy/nginx/dev.makam.co.id.conf");

  it("gives the SumoPod webhook the path the app serves, /api/webhooks/pembayaran", () => {
    expect(block).toMatch(/location = \/api\/webhooks\/pembayaran \{/);
    expect(block).not.toMatch(/\/api\/webhooks\/sumopod/);
  });
});
