import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiskFileStore } from "@/adapters/live/disk-file-store";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { browser } from "../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/**
 * `testServerRuntime()` wires the in-memory FakeFileStore (development and
 * test never touch disk); this route only has anything to serve when the
 * live host-disk adapter is active, so each test swaps one in against a
 * throwaway directory and puts it back after.
 */
async function withDiskFileStore<T>(run: (store: DiskFileStore) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "makam-files-route-"));
  const { adapters } = server.runtime();
  const original = adapters.files;
  const store = new DiskFileStore({ root, secret: "route-test-secret", publicOrigin: "http://localhost", clock: adapters.clock });
  adapters.files = store;
  try {
    return await run(store);
  } finally {
    adapters.files = original;
    await rm(root, { recursive: true, force: true });
  }
}

const get = (url: string, key: string[]) => GET(new Request(url), { params: Promise.resolve({ key }) });

describe("GET /api/files/[...key] (a FileStore signed URL)", () => {
  it("serves the file's bytes and content type, never cached and never indexed", async () =>
    withDiskFileStore(async (store) => {
      await store.put({ key: "ktp-cek/akun-1/scan.jpg", body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
      const url = await store.signedUrl("ktp-cek/akun-1/scan.jpg", { expiresInSeconds: 300 });

      const response = await get(url, ["ktp-cek", "akun-1", "scan.jpg"]);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    }));

  it("404s a tampered signature", async () =>
    withDiskFileStore(async (store) => {
      await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
      const url = new URL(await store.signedUrl("a.jpg", { expiresInSeconds: 300 }));
      url.searchParams.set("sig", "0".repeat(40));

      const response = await get(url.toString(), ["a.jpg"]);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }));

  it("404s once the signed URL's lifetime has passed", async () =>
    withDiskFileStore(async (store) => {
      await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
      const url = await store.signedUrl("a.jpg", { expiresInSeconds: -1 });

      const response = await get(url, ["a.jpg"]);

      expect(response.status).toBe(404);
    }));

  it("404s a key that never existed", async () =>
    withDiskFileStore(async () => {
      const response = await get("http://localhost/api/files/never-existed.jpg?exp=9999999999&sig=" + "a".repeat(40), [
        "never-existed.jpg",
      ]);

      expect(response.status).toBe(404);
    }));

  it("404s a malformed query (no Zod-shaped exp/sig) without ever asking the FileStore", async () =>
    withDiskFileStore(async (store) => {
      await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });

      const missingSig = await get("http://localhost/api/files/a.jpg?exp=9999999999", ["a.jpg"]);
      const nonNumericExp = await get("http://localhost/api/files/a.jpg?exp=soon&sig=" + "a".repeat(40), ["a.jpg"]);

      expect(missingSig.status).toBe(404);
      expect(nonNumericExp.status).toBe(404);
    }));

  it("404s while development/test's in-memory FakeFileStore is in use (never served over HTTP)", async () => {
    const response = await get("http://localhost/api/files/a.jpg?exp=9999999999&sig=" + "a".repeat(40), ["a.jpg"]);
    expect(response.status).toBe(404);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
