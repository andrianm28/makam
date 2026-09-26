import { scrubText } from "./scrub";

/**
 * Sends an error that the caller handled (the outcome is kept, e.g. a
 * WhatsApp marked "gagal") to error monitoring. The web server and the worker
 * wire it to Sentry's `captureException`, whose `beforeSend` scrubs every
 * event (`scrub.ts`); tags must still carry nothing personal: no names, phone
 * numbers or emails, only codes such as a template or channel name.
 */
export type ReportError = (error: unknown, context: { tags: Record<string, string> }) => void;

/**
 * The error as it may be reported: message and stack with phone numbers
 * scrubbed, so nothing personal leaves even before Sentry's own scrubbing.
 */
export function scrubbedError(error: unknown): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  const scrubbed = new Error(scrubText(original.message));
  scrubbed.name = original.name;
  scrubbed.stack = original.stack ? scrubText(original.stack) : undefined;
  return scrubbed;
}
