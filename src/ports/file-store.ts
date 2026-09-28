/**
 * FileStore port: the private object store for KTP, heirship documents, IPTM
 * scans, photo proof, transfer proofs and agreement scans. In v1 (ADR 0002,
 * beta UAT amendment) this is a private, makam-only volume on the host's own
 * disk in Jakarta; AWS S3 (ap-southeast-3) is planned for v2 behind the same
 * port. Files are personal data: never public, only short-lived signed URLs.
 */
export interface StoredFile {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface FileStore {
  put(file: StoredFile): Promise<{ key: string }>;
  /** A short-lived URL to read the file. Throws when the key does not exist. */
  signedUrl(key: string, options: { expiresInSeconds: number }): Promise<string>;
  delete(key: string): Promise<void>;
}

/**
 * A FileStore that can also serve back the signed URLs it issues (the host-disk
 * `DiskFileStore` today; a future S3 adapter would add it too). Kept off
 * `FileStore` itself because the fake used in development and test must not
 * have it — `/api/files/[...key]` promises that fake a 404, never a body.
 */
export interface SignedReadableFileStore extends FileStore {
  /** Verifies `signature`/`expiresAt` and reads the file if valid; null otherwise (see the adapter for the exact rule). */
  readSigned(key: string, expiresAt: number, signature: string): Promise<StoredFile | null>;
}

/**
 * Whether `store` can serve signed reads, checked by shape rather than
 * `instanceof`. `serverRuntime()` caches its adapters on `globalThis`, and a
 * page bundle and the `/api/files/[...key]` route bundle can each load their
 * own copy of the adapter module (a per-bundle `DiskFileStore` class), so
 * whichever bundle's runtime cache wins, an `instanceof` check against
 * *this* bundle's class would wrongly say no. A structural check has no such
 * blind spot: it is true for any store — from any bundle, real or a future
 * adapter — that actually has a `readSigned` function.
 */
export function supportsSignedReads(store: FileStore): store is SignedReadableFileStore {
  return typeof (store as Partial<SignedReadableFileStore>).readSigned === "function";
}

/**
 * No FileStore write may exceed this size: defense in depth at the port seam,
 * shared by the fake and every live adapter. Each caller also enforces its
 * own, tighter limit close to the upload (e.g. `KTP_CHECK_MAX_BYTES`,
 * `AGREEMENT_SCAN_MAX_BYTES`), so this one is never expected to bind in
 * practice.
 */
export const FILE_STORE_MAX_BYTES = 15 * 1024 * 1024;

/** One path segment: starts and ends with a letter or digit, `.`/`_`/`-` allowed between. Rejects `.`, `..`, empty and hidden (dot-led) segments outright. */
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** The longest key any adapter accepts (well beyond any real key: `<prefix>/<uuid>/<uuid>.<ext>`). */
const MAX_KEY_LENGTH = 512;

/**
 * Whether `key` is safe to use as a relative disk path on every adapter,
 * fake included: no `..`, no leading `/`, no empty or hidden segment, no
 * segment containing anything but letters, digits, `.`, `_` or `-`. Keeping
 * this at the port means a key domain code builds one way is refused the
 * same way everywhere, not only once it happens to reach a real disk.
 */
export function isSafeFileKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    key.split("/").every((segment) => SAFE_KEY_SEGMENT.test(segment))
  );
}

/** Throws unless `isSafeFileKey(key)`. */
export function assertSafeFileKey(key: string): void {
  if (!isSafeFileKey(key)) throw new Error("FileStore key is not path-traversal-safe");
}
