/**
 * The kinds of file staff upload as photos or scans (KTP check, agreement
 * scan, and later proofs), recognised by their first bytes: a declared type
 * that does not match the content is refused, so a renamed file of another
 * kind never passes.
 */
export type DocumentContentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const DOCUMENT_TYPES: Record<DocumentContentType, { extension: string; matches: (body: Uint8Array) => boolean }> = {
  "image/jpeg": { extension: "jpg", matches: (body) => startsWith(body, [0xff, 0xd8, 0xff]) },
  "image/png": { extension: "png", matches: (body) => startsWith(body, [0x89, 0x50, 0x4e, 0x47]) },
  // RIFF....WEBP
  "image/webp": {
    extension: "webp",
    matches: (body) => startsWith(body, [0x52, 0x49, 0x46, 0x46]) && startsWith(body.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
  // %PDF
  "application/pdf": { extension: "pdf", matches: (body) => startsWith(body, [0x25, 0x50, 0x44, 0x46]) },
};

function startsWith(body: Uint8Array, magic: number[]): boolean {
  return body.length >= magic.length && magic.every((byte, index) => body[index] === byte);
}

/**
 * The file's extension when its declared type is one of `accepted` and its
 * first bytes match that type; null otherwise.
 */
export function documentExtension(
  file: { body: Uint8Array; contentType: string },
  accepted: readonly DocumentContentType[],
): string | null {
  if (!(accepted as readonly string[]).includes(file.contentType)) return null;
  const type = DOCUMENT_TYPES[file.contentType as DocumentContentType];
  return type.matches(file.body) ? type.extension : null;
}
