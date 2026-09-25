/**
 * FileStore port: the private bucket (AWS S3 Jakarta, ap-southeast-3) for KTP,
 * heirship documents, IPTM scans, photo proof, transfer proofs and agreement
 * scans. Files are personal data: never public, only short-lived signed URLs.
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
