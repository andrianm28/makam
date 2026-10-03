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
  const stagingProxy = read("deploy/nginx/makam-staging-proxy.conf");
  const proxy = read("deploy/nginx/makam-prod-proxy.conf");

  it("serves makam.co.id and www, over the existing Certbot certificate, and redirects http to https", () => {
    expect(block).toMatch(/server_name makam\.co\.id www\.makam\.co\.id;/);
    expect(block).toContain("ssl_certificate     /etc/letsencrypt/live/makam.co.id/fullchain.pem;");
    expect(block).toContain("ssl_certificate_key /etc/letsencrypt/live/makam.co.id/privkey.pem;");
    expect(block).toMatch(/return 301 https:\/\/\$host\$request_uri;/);
    expect(block).toMatch(/location \^~ \/\.well-known\/acme-challenge\//);
  });

  it("proxies every location to makam-prod web on 127.0.0.1:3100 and never to staging's port", () => {
    expect(proxy).toContain("proxy_pass         http://127.0.0.1:3100;");
    expect(block).not.toContain("3110");
    expect(block.match(/include snippets\/makam-prod-proxy\.conf;/g)).toHaveLength(3);
    // The same proxy lines as staging, apart from the port.
    const lines = (text: string) => text.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines(proxy).join("\n").replace("3100", "3110")).toBe(lines(stagingProxy).join("\n"));
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

  it("starts HSTS at one day, and the runbook says when to raise it to a year", () => {
    expect(block).toMatch(/Strict-Transport-Security "max-age=86400" always;/);
    expect(block).not.toMatch(/max-age=31536000/);
    const runbook = read("docs/ops/runbook.md");
    expect(runbook).toMatch(/two (stable )?weeks[^]*max-age=31536000/);
  });

  it("leaves the payment webhook reachable with no auth of any kind", () => {
    expect(block).toMatch(/location = \/api\/webhooks\/pembayaran \{/);
    expect(block).not.toMatch(/auth_basic|auth_request|allow |deny (?!all;\s*access_log)/);
  });

  it("denies dotfiles other than the ACME challenge", () => {
    expect(block).toMatch(/location ~ \/\\\. \{\s*deny all;/);
  });
});

describe("the maintenance block and page for makam.co.id", () => {
  const block = read("deploy/nginx/maintenance/makam.co.id.conf");
  const page = read("deploy/nginx/maintenance/index.html");

  it("serves the page for every path with 503 and Retry-After, and keeps the ACME challenge open", () => {
    expect(block).toMatch(/server_name makam\.co\.id www\.makam\.co\.id;/);
    expect(block).toContain("ssl_certificate     /etc/letsencrypt/live/makam.co.id/fullchain.pem;");
    expect(block).toMatch(/error_page 503 @pemeliharaan;/);
    expect(block).toMatch(/add_header Retry-After "?\d+"? always;/);
    expect(block).toMatch(/location \/ \{\s*return 503;/);
    expect(block).toMatch(/location \^~ \/\.well-known\/acme-challenge\//);
    expect(block).not.toMatch(/proxy_pass/);
  });

  it("answers /api/health with a 503 JSON body, so the uptime alarm sees the outage", () => {
    expect(block).toMatch(/location = \/api\/health \{[^}]*default_type application\/json;[^}]*return 503 '\{[^']*"ok":false/);
  });

  it("is a page in Bahasa Indonesia with no external assets", () => {
    expect(page).toMatch(/<html lang="id">/);
    expect(page).toMatch(/pemeliharaan/i);
    expect(page).not.toMatch(/(src|href)\s*=\s*["']?(https?:)?\/\//i);
    expect(page).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
    expect(page).not.toMatch(/@import/);
  });
});

describe("install-host.sh", () => {
  const install = read("deploy/install-host.sh");

  it("installs makam-switch and makam-arsip-app-lama, and the nginx blocks they read, without enabling or reloading anything", () => {
    expect(install).toMatch(/deploy\/bin\/makam-switch/);
    expect(install).toMatch(/deploy\/bin\/makam-arsip-app-lama/);
    expect(install).toMatch(/deploy\/nginx\/makam\.co\.id\.conf/);
    expect(install).toMatch(/deploy\/nginx\/makam-prod-proxy\.conf/);
    expect(install).toMatch(/deploy\/nginx\/maintenance/);
    // The switch is makam-switch's, on the day: the installer never copies a block into /etc/nginx/sites-*.
    expect(install).not.toMatch(/sites-available\/makam\.co\.id/);
  });
});

describe('the runbook "Hari switch"', () => {
  const runbook = read("docs/ops/runbook.md");
  const section = runbook.slice(runbook.indexOf("## Hari switch"), runbook.indexOf("\n## ", runbook.indexOf("## Hari switch") + 5));

  it("gives the day's steps in order: preflight, archive, promotion, switch, checks, fallback", () => {
    expect(runbook).toContain("## Hari switch");
    // Each step is a numbered item; the markers must sit in steps 1, 2, 3, 4, 5, 5 and 6 respectively.
    const steps = section.split(/\n(?=\d+\. \*\*)/).slice(1);
    const markers: [number, string][] = [
      [0, "makam-preflight"],
      [1, "makam-arsip-app-lama"],
      [2, "promote.yml"],
      [3, "makam-switch --ke v1"],
      [4, "/api/health"],
      [4, "/api/webhooks/pembayaran"],
      [5, "makam-switch --ke pemeliharaan"],
    ];
    for (const [step, marker] of markers) expect(steps[step], marker).toContain(marker);
  });

  it("has the owner archive the makam-app GitHub repository, read-only", () => {
    expect(section).toMatch(/makam-app/);
    expect(section).toMatch(/archive/i);
  });
});
