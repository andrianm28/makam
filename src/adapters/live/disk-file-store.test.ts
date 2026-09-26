import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileStoreContract } from "@/adapters/file-store.contract";
import { FakeClock } from "@/adapters/memory/fake-clock";
import { wib } from "@/lib/time/jakarta";
import { DiskFileStore } from "./disk-file-store";

const SECRET = "test-only-secret-for-hmac-signing-not-real";
const ORIGIN = "https://dev.makam.co.id";

/** What following a `signedUrl` gets, exactly as the app route (`/api/files/[...key]`) computes it: the key and query params it reads, handed to `readSigned`. */
async function open(store: DiskFileStore, url: string) {
  const parsed = new URL(url);
  const key = parsed.pathname
    .replace(/^\/api\/files\//, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  const exp = Number(parsed.searchParams.get("exp"));
  const sig = parsed.searchParams.get("sig") ?? "";
  return store.readSigned(key, exp, sig);
}

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "makam-filestore-"));
}

fileStoreContract("host-disk adapter", async () => {
  const root = await tempRoot();
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const store = new DiskFileStore({ root, secret: SECRET, publicOrigin: ORIGIN, clock });
  return {
    store,
    advance: (milliseconds) => clock.advance({ milliseconds }),
    open: (url) => open(store, url),
    close: () => rm(root, { recursive: true, force: true }),
  };
});

describe("host-disk FileStore adapter", () => {
  async function harness() {
    const root = await tempRoot();
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const store = new DiskFileStore({ root, secret: SECRET, publicOrigin: ORIGIN, clock });
    return { root, clock, store };
  }

  it("signs a URL on the app's own origin, at the /api/files route, naming an expiry and a signature", async () => {
    const { store } = await harness();
    await store.put({ key: "ktp-cek/akun-1/scan.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });

    const url = await store.signedUrl("ktp-cek/akun-1/scan.jpg", { expiresInSeconds: 300 });

    const parsed = new URL(url);
    expect(parsed.origin).toBe(ORIGIN);
    expect(parsed.pathname).toBe("/api/files/ktp-cek/akun-1/scan.jpg");
    expect(parsed.searchParams.get("exp")).toBe(String(wib("2026-10-01 09:05").getTime() / 1000));
    expect(parsed.searchParams.get("sig")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses a URL whose signature was tampered with", async () => {
    const { store } = await harness();
    await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
    const url = await store.signedUrl("a.jpg", { expiresInSeconds: 300 });
    const tampered = url.replace(/sig=[^&]+/, "sig=not-the-real-signature-aaaaaaaaaaaaaaaa");

    expect(await open(store, tampered)).toBeNull();
  });

  it("refuses a URL naming a different key than the one it was signed for", async () => {
    const { store } = await harness();
    await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
    await store.put({ key: "b.jpg", body: new Uint8Array([2]), contentType: "image/jpeg" });
    const urlForA = await store.signedUrl("a.jpg", { expiresInSeconds: 300 });
    const swapped = urlForA.replace("a.jpg", "b.jpg");

    expect(await open(store, swapped)).toBeNull();
  });

  it("refuses a signature made with a different secret, even for the same key and expiry", async () => {
    const { root, clock } = await harness();
    const first = new DiskFileStore({ root, secret: SECRET, publicOrigin: ORIGIN, clock });
    const second = new DiskFileStore({ root, secret: "a-completely-different-secret-value", publicOrigin: ORIGIN, clock });
    await first.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });

    const signedByOther = await second.signedUrl("a.jpg", { expiresInSeconds: 300 });

    expect(await open(first, signedByOther)).toBeNull();
  });

  it("a second store pointed at the same root reads files the first one wrote (survives a process restart)", async () => {
    const { root, clock } = await harness();
    const first = new DiskFileStore({ root, secret: SECRET, publicOrigin: ORIGIN, clock });
    await first.put({ key: "perjanjian/lokasi-1/scan.pdf", body: new Uint8Array([9, 9]), contentType: "application/pdf" });

    const second = new DiskFileStore({ root, secret: SECRET, publicOrigin: ORIGIN, clock });
    const url = await second.signedUrl("perjanjian/lokasi-1/scan.pdf", { expiresInSeconds: 60 });

    expect(await open(second, url)).toEqual({
      key: "perjanjian/lokasi-1/scan.pdf",
      body: new Uint8Array([9, 9]),
      contentType: "application/pdf",
    });
  });

  it("readSigned returns null for a malformed expiry or signature rather than throwing", async () => {
    const { store } = await harness();
    await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });

    await expect(store.readSigned("a.jpg", Number.NaN, "x")).resolves.toBeNull();
    await expect(store.readSigned("a.jpg", 9_999_999_999, "")).resolves.toBeNull();
    await expect(store.readSigned("../escape", 9_999_999_999, "x")).resolves.toBeNull();
  });

  it("writes nothing to the console while storing, signing, reading or deleting", async () => {
    const { store } = await harness();
    const written = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
    const url = await store.signedUrl("a.jpg", { expiresInSeconds: 60 });
    await open(store, url);
    await store.delete("a.jpg");
    await store.signedUrl("a.jpg", { expiresInSeconds: 60 }).catch(() => undefined);

    for (const spy of written) expect(spy).not.toHaveBeenCalled();
    written.forEach((spy) => spy.mockRestore());
  });

  it("keeps blobs and their metadata out of each other's way: deleting one key leaves a sibling untouched on disk", async () => {
    const { root, store } = await harness();
    await store.put({ key: "a.jpg", body: new Uint8Array([1]), contentType: "image/jpeg" });
    await store.put({ key: "b.jpg", body: new Uint8Array([2]), contentType: "image/jpeg" });

    await store.delete("a.jpg");

    const blobs = await readdir(path.join(root, "blobs"));
    expect(blobs).toEqual(["b.jpg"]);
  });
});
