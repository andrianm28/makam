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

describe("the production block for makam.co.id and www", () => {
  const block = read("deploy/nginx/makam.co.id.conf");
  const staging = read("deploy/nginx/dev.makam.co.id.conf");
  const proxy = read("deploy/nginx/makam-staging-proxy.conf");

  it("serves makam.co.id and www, over the existing Certbot certificate, and redirects http to https", () => {
    expect(block).toMatch(/server_name makam\.co\.id www\.makam\.co\.id;/);
    expect(block).toContain("ssl_certificate     /etc/letsencrypt/live/makam.co.id/fullchain.pem;");
    expect(block).toContain("ssl_certificate_key /etc/letsencrypt/live/makam.co.id/privkey.pem;");
    expect(block).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
    expect(block).toMatch(/location \^~ \/\.well-known\/acme-challenge\//);
  });

  it("proxies to makam-prod web on 127.0.0.1:3100 and never to staging's port", () => {
    expect(block).toContain("proxy_pass         http://127.0.0.1:3100;");
    expect(block).not.toContain("3110");
    // The same proxy lines as staging, apart from the port.
    for (const line of proxy.split("\n").filter((l) => l.startsWith("proxy_") && !l.includes("proxy_pass"))) {
      expect(block).toContain(line.replace(/\s+/g, " ").trim().split(" ")[0]);
    }
  });

  it("keeps the staging block's body size and timeouts", () => {
    expect(block).toMatch(/client_max_body_size 12m;/);
    expect(block).toMatch(/location = \/api\/health \{[^}]*proxy_read_timeout 30s;/);
    expect(block).toMatch(/location = \/api\/webhooks\/pembayaran \{[^}]*proxy_read_timeout 60s;/);
    expect(block).toMatch(/location \/ \{[^}]*proxy_read_timeout 60s;/);
  });

  it("keeps the staging block's security headers and, unlike staging, is not marked noindex", () => {
    for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]) {
      expect(block).toContain(header);
      expect(staging).toContain(header);
    }
    expect(block).not.toMatch(/X-Robots-Tag/);
  });

  it("leaves the payment webhook reachable with no auth of any kind", () => {
    expect(block).toMatch(/location = \/api\/webhooks\/pembayaran \{/);
    expect(block).not.toMatch(/auth_basic|auth_request|allow |deny (?!all;\s*access_log)/);
  });

  it("denies dotfiles other than the ACME challenge", () => {
    expect(block).toMatch(/location ~ \/\\\. \{\s*deny all;/);
  });
});
