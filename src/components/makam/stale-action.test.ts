import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { describe, expect, it } from "vitest";
import { isStaleActionError, passOnStaleAction } from "./stale-action";

/**
 * A form left open across a deploy posts the Server Action id of the old build. The new build answers 404 with
 * `x-nextjs-action-not-found` and the client throws an unrecognized-action error (ticket 98).
 */
describe("a stale Server Action", () => {
  const stale = () => new UnrecognizedActionError("Server action not found.");

  it("is what the client throws when the server does not know the action a form posted", () => {
    expect(isStaleActionError(stale())).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an ordinary error", new Error("Failed to find Server Action")],
    ["a plain failed request", new Error("An unexpected response was received from the server.")],
    ["a string", "Server action not found."],
    ["nothing", undefined],
  ])("is not %s", (_what, error) => {
    expect(isStaleActionError(error)).toBe(false);
  });

  it("is thrown on by a nearer error page to the root error page, as the very same error", () => {
    const error = stale();
    let thrown: unknown;
    try {
      passOnStaleAction(error);
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBe(error);
  });

  it("stays with a nearer error page when the error is any other", () => {
    expect(() => passOnStaleAction(new Error("De daftar tidak terbaca"))).not.toThrow();
  });
});
