import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FILE_STORE_MAX_BYTES, type FileStore, type StoredFile } from "@/ports/file-store";

/** What a test harness offers on top of the `FileStore` interface itself. */
export interface FileStoreHarness {
  store: FileStore;
  /** Advances the Clock `signedUrl`'s expiry (and this check) reads "now" from. */
  advance(milliseconds: number): void;
  /** Follows a signed URL as a browser would: the file if it is one of the store's own, correctly signed and not yet expired; null otherwise. */
  open(url: string): Promise<StoredFile | null>;
  close(): Promise<void>;
}

const SAMPLE: StoredFile = {
  key: "ktp-cek/akun-1/scan.jpg",
  body: new Uint8Array([1, 2, 3, 4, 5]),
  contentType: "image/jpeg",
};

/**
 * The FileStore contract: the same assertions for the in-memory fake and
 * every live adapter (the host-disk adapter today; S3 in v2), so the fake the
 * domain tests rely on behaves like the real thing — including the
 * path-traversal and size guards every caller depends on.
 */
export function fileStoreContract(name: string, createHarness: () => Promise<FileStoreHarness> | FileStoreHarness) {
  describe(`FileStore contract: ${name}`, () => {
    let harness: FileStoreHarness;
    beforeEach(async () => {
      harness = await createHarness();
    });
    afterEach(async () => {
      await harness.close();
    });

    it("stores a file and opens it back through its own signed URL", async () => {
      await harness.store.put(SAMPLE);

      const url = await harness.store.signedUrl(SAMPLE.key, { expiresInSeconds: 300 });
      expect(await harness.open(url)).toEqual(SAMPLE);
    });

    it("a signed URL keeps working right up to its lifetime, then stops", async () => {
      await harness.store.put(SAMPLE);
      const url = await harness.store.signedUrl(SAMPLE.key, { expiresInSeconds: 300 });

      harness.advance(300_000);
      expect(await harness.open(url)).toEqual(SAMPLE);

      harness.advance(1);
      expect(await harness.open(url)).toBeNull();
    });

    it("refuses a signed URL for a key that was never stored", async () => {
      await expect(harness.store.signedUrl("never/stored.jpg", { expiresInSeconds: 60 })).rejects.toThrow();
    });

    it("delete removes the file: its previously issued signed URL stops opening", async () => {
      await harness.store.put(SAMPLE);
      const url = await harness.store.signedUrl(SAMPLE.key, { expiresInSeconds: 300 });

      await harness.store.delete(SAMPLE.key);

      expect(await harness.open(url)).toBeNull();
      await expect(harness.store.signedUrl(SAMPLE.key, { expiresInSeconds: 300 })).rejects.toThrow();
    });

    it("deleting a key that was never stored does not throw", async () => {
      await expect(harness.store.delete("never/stored-either.jpg")).resolves.toBeUndefined();
    });

    it("put replaces the previous contents stored at the same key", async () => {
      await harness.store.put(SAMPLE);
      const replacement: StoredFile = { ...SAMPLE, body: new Uint8Array([9, 9, 9]), contentType: "application/pdf" };

      await harness.store.put(replacement);

      const url = await harness.store.signedUrl(SAMPLE.key, { expiresInSeconds: 60 });
      expect(await harness.open(url)).toEqual(replacement);
    });

    it.each(["../escape.jpg", "/absolute.jpg", "a/../../escape.jpg", "a/./b.jpg", "", "a//b.jpg", "a/b/", ".hidden"])(
      "refuses a path-traversal-unsafe key: %j",
      async (key) => {
        await expect(harness.store.put({ key, body: SAMPLE.body, contentType: SAMPLE.contentType })).rejects.toThrow();
      },
    );

    it("refuses a file over the FileStore's size limit", async () => {
      const tooBig: StoredFile = { key: "too-big.jpg", body: new Uint8Array(FILE_STORE_MAX_BYTES + 1), contentType: "image/jpeg" };
      await expect(harness.store.put(tooBig)).rejects.toThrow();
    });

    it("refuses a file with no content type", async () => {
      await expect(harness.store.put({ key: "no-type.jpg", body: SAMPLE.body, contentType: "" })).rejects.toThrow();
    });
  });
}
