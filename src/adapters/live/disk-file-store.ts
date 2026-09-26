import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clock } from "@/ports/clock";
import { assertSafeFileKey, FILE_STORE_MAX_BYTES, type FileStore, type StoredFile } from "@/ports/file-store";

interface FileMeta {
  contentType: string;
}

function sign(secret: string, key: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`file\n${key}\n${expiresAt}`).digest("base64url");
}

function signaturesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface DiskFileStoreOptions {
  /** The private volume's mount point (`env.FILES_ROOT`; docker-compose.prod.yml). Never served by nginx or Next's static handler: the only way in or out is this adapter and the app route it signs URLs for. */
  root: string;
  /** Signs and verifies signed URLs (`env.AUTH_SECRET`, the same key the identity module signs OTP hashes with, under a different HMAC label). */
  secret: string;
  /** The origin the browser reaches the app on (`new URL(env.APP_BASE_URL).origin`), so a signed URL is absolute. */
  publicOrigin: string;
  clock: Clock;
}

/**
 * The live FileStore for v1 (ADR 0002, beta UAT amendment): a private,
 * makam-only Docker volume on the host's own disk in Jakarta, instead of AWS
 * S3 (planned for v2 behind this same port). Every stored file is two
 * entries under `root`: the bytes under `blobs/<key>` and `{ contentType }`
 * under `meta/<key>.json`, written via a temp file plus rename so a reader
 * never sees a partial write.
 *
 * A signed URL never carries the file: it names the app route
 * (`/api/files/<key>`, `src/app/api/files/[...key]/route.ts`) plus an expiry
 * and an HMAC-SHA256 signature over `key` and `expiresAt`. `readSigned` is
 * that route's whole job — verify the signature and expiry, then read — kept
 * here (not on the `FileStore` interface) so the one secret and the one
 * Clock that signed the URL are also the ones that check it.
 */
export class DiskFileStore implements FileStore {
  readonly #root: string;
  readonly #secret: string;
  readonly #publicOrigin: string;
  readonly #clock: Clock;

  constructor(options: DiskFileStoreOptions) {
    this.#root = options.root;
    this.#secret = options.secret;
    this.#publicOrigin = options.publicOrigin;
    this.#clock = options.clock;
  }

  async put(file: StoredFile): Promise<{ key: string }> {
    assertSafeFileKey(file.key);
    if (!file.contentType.trim()) throw new Error("FileStore requires a content type");
    if (file.body.byteLength > FILE_STORE_MAX_BYTES) {
      throw new Error(`File exceeds the FileStore limit of ${FILE_STORE_MAX_BYTES} bytes`);
    }

    const blobPath = this.#resolve("blobs", file.key);
    const metaPath = this.#resolve("meta", `${file.key}.json`);
    await mkdir(path.dirname(blobPath), { recursive: true });
    await mkdir(path.dirname(metaPath), { recursive: true });

    const tmpBlobPath = `${blobPath}.${randomUUID()}.tmp`;
    const tmpMetaPath = `${metaPath}.${randomUUID()}.tmp`;
    await writeFile(tmpBlobPath, file.body, { mode: 0o600 });
    const meta: FileMeta = { contentType: file.contentType };
    await writeFile(tmpMetaPath, JSON.stringify(meta), { mode: 0o600 });
    await rename(tmpMetaPath, metaPath);
    await rename(tmpBlobPath, blobPath);

    return { key: file.key };
  }

  async signedUrl(key: string, options: { expiresInSeconds: number }): Promise<string> {
    assertSafeFileKey(key);
    if (!(await this.#exists(key))) throw new Error(`No file stored at ${key}`);

    const expiresAt = Math.floor(this.#clock.now().getTime() / 1000) + options.expiresInSeconds;
    const signature = sign(this.#secret, key, expiresAt);
    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.#publicOrigin}/api/files/${encodedKey}?exp=${expiresAt}&sig=${signature}`;
  }

  async delete(key: string): Promise<void> {
    assertSafeFileKey(key);
    await Promise.all([
      rm(this.#resolve("blobs", key), { force: true }),
      rm(this.#resolve("meta", `${key}.json`), { force: true }),
    ]);
  }

  /**
   * Verifies that `signature` is this store's own signature for `key` and
   * `expiresAt` (an epoch-seconds Zod already parsed as a positive integer),
   * and that it has not expired on the Clock; reads and returns the file if
   * so. A bad key, a wrong or tampered signature, an expired link, or a file
   * since deleted all return null — never throw — so the app route always
   * has a plain 404 to give back, with nothing more to report.
   */
  async readSigned(key: string, expiresAt: number, signature: string): Promise<StoredFile | null> {
    if (!Number.isInteger(expiresAt) || !signature) return null;
    let safeKey: string;
    try {
      assertSafeFileKey(key);
      safeKey = key;
    } catch {
      return null;
    }
    if (!signaturesMatch(sign(this.#secret, safeKey, expiresAt), signature)) return null;
    if (this.#clock.now().getTime() > expiresAt * 1000) return null;

    try {
      const [body, metaRaw] = await Promise.all([
        readFile(this.#resolve("blobs", safeKey)),
        readFile(this.#resolve("meta", `${safeKey}.json`), "utf8"),
      ]);
      const meta = JSON.parse(metaRaw) as FileMeta;
      return { key: safeKey, body: new Uint8Array(body), contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  async #exists(key: string): Promise<boolean> {
    try {
      await stat(this.#resolve("blobs", key));
      return true;
    } catch {
      return false;
    }
  }

  /** Joins `relative` under `root/kind`, refusing (defense in depth, on top of `assertSafeFileKey`) anything that would resolve outside it. */
  #resolve(kind: "blobs" | "meta", relative: string): string {
    const kindRoot = path.resolve(this.#root, kind);
    const full = path.resolve(kindRoot, relative);
    if (full !== kindRoot && !full.startsWith(kindRoot + path.sep)) {
      throw new Error("FileStore key resolved outside its store root");
    }
    return full;
  }
}
