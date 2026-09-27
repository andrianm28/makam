import { z } from "zod";

/**
 * A file the browser picked, carried to a Server Action as one base64 string.
 *
 * A `File` cannot travel as an argument of a Server Action call the way
 * FormData can, and the wizard's Kirim posts its own draft rather than a form, so
 * the photo goes across as the string a hidden field can hold. The size is
 * checked here, where the field is read, so the limit is written once and the
 * browser refuses a photo too big before sending anything.
 */

/** One file as the browser read it: its declared type, its name and its bytes. */
export const fileBase64 = (maxBytes: number) =>
  z.string().min(1).refine((value) => bytesOf(value).length <= maxBytes, `Berkas paling besar ${megabytesOf(maxBytes)} MB.`);

/** The bytes of a base64 file, as the module that stores it wants them. */
export function bytesOf(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/** A file's bytes as the base64 string a Server Action argument carries. Runs in the browser. */
export function toBase64(body: Uint8Array): string {
  let binary = "";
  for (const byte of body) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** "4 MB" / "512 KB", for the one message a refused file is said with. */
export function megabytesOf(maxBytes: number): string {
  return maxBytes % (1024 * 1024) === 0 ? String(maxBytes / (1024 * 1024)) : String(Math.round(maxBytes / 1024));
}
