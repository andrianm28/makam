import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * Whether `error` is a stale Server Action: a form left open across a deploy posted the action id of the old build,
 * the new build answered 404 with `x-nextjs-action-not-found`, and the client threw an unrecognized-action error.
 * Nothing is wrong with the data; the page itself is old, so only loading it again helps.
 *
 * The one place that names Next's `unstable_` export, so a rename there is changed (and tested) here only.
 */
export function isStaleActionError(error: unknown): boolean {
  return unstable_isUnrecognizedActionError(error);
}

/**
 * For an error page nearer than the root one (an `error.tsx` of its own), whose "Coba lagi" would re-render the same
 * old bundle: call it first, and a stale Server Action is thrown on to the next error page up, the root `error.tsx`,
 * which says the page was updated and offers Muat ulang. Any other error returns, for the nearer page to show.
 */
export function passOnStaleAction(error: unknown): void {
  if (isStaleActionError(error)) throw error;
}
