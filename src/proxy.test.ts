import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());
const at = (path: string, method = "GET") => proxy(new NextRequest(`http://localhost:3000${path}`, { method }));

describe("Release gate in the proxy (ADR 0006)", () => {
  it("at Rilis 1 a staff page of a closed feature answers 404 and a Server Action post to it too", async () => {
    vi.stubEnv("RILIS_TERBUKA", "1");
    expect((await at("/staf/admin-platform/wakaf"))?.status).toBe(404);
    expect((await at("/staf/mitra-jasa/pekerjaan", "POST"))?.status).toBe(404);
    expect((await at("/staf/admin-lokasi/abc/perpanjangan/p1"))?.status).toBe(404);
  });

  it("at Rilis 1 a public or Akun Saya page of a closed feature shows Segera hadir at the same URL", async () => {
    vi.stubEnv("RILIS_TERBUKA", "1");
    for (const path of ["/wakaf-tanah", "/akun/wakaf", "/tpu/t1", "/pengurusan-tpu", "/perpanjangan/abc/berkas"]) {
      const response = await at(path);
      expect(response?.headers.get("x-middleware-rewrite"), path).toContain("/segera-hadir");
    }
    expect((await proxy(new NextRequest("http://localhost:3000/lokasi?jenis=tpu")))?.headers.get("x-middleware-rewrite")).toContain("/segera-hadir");
  });

  it("Rilis 1 pages pass through at Rilis 1, and everything passes at Rilis 3", async () => {
    vi.stubEnv("RILIS_TERBUKA", "1");
    for (const path of ["/", "/layanan", "/layanan/L-1", "/lokasi", "/perpanjangan/abc", "/staf/admin-platform/tagihan", "/pesan-makam/saat-duka"]) {
      expect((await at(path))?.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect((await at(path))?.status, path).not.toBe(404);
    }
    vi.stubEnv("RILIS_TERBUKA", "3");
    for (const path of ["/wakaf-tanah", "/staf/admin-platform/wakaf", "/tpu/t1", "/lokasi?jenis=tpu"]) {
      expect((await at(path))?.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect((await at(path))?.status, path).not.toBe(404);
    }
  });

  it("at Rilis 1 an encoded, slash-doubled or trailing-slash spelling of a closed route is closed too", async () => {
    vi.stubEnv("RILIS_TERBUKA", "1");
    for (const path of ["/staf/admin-platform/%74pu/x", "/staf//admin-platform/tpu", "/staf/admin-platform/tpu/", "/staf/admin-platform/%2574pu", "/STAF/admin-platform/tpu"]) {
      expect((await at(path))?.status, path).toBe(404);
    }
    expect((await at("/%77akaf-tanah"))?.headers.get("x-middleware-rewrite")).toContain("/segera-hadir");
    expect((await at("/wakaf-tanah//"))?.headers.get("x-middleware-rewrite")).toContain("/segera-hadir");
  });

  it("the matcher skips only real static assets: a gated path with a dot still reaches the proxy", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/tpu/abc.def", "/pengurusan/PNG-1.2", "/staf/admin-platform/tpu/x.y", "/wakaf-tanah/a.b"]) expect(matcher.test(path), path).toBe(true);
    for (const path of ["/_next/static/a.js", "/favicon.ico", "/brand/logo.svg", "/content/a.jpg", "/icons/a.png", "/sw.js", "/robots.txt", "/staf.webmanifest", "/api/health"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });
});
