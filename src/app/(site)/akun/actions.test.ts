import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { keluar } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** What a Server Action ended with: its return, or what it threw (a redirect is thrown). */
async function outcomeOf(action: () => Promise<unknown>) {
  try {
    return { returned: await action() };
  } catch (thrown) {
    return { thrown };
  }
}

describe("Keluar (Server Action)", () => {
  it("with no session is refused by the guard and sends the visitor to Masuk marked as an ended session, not as a Keluar", async () => {
    const outcome = await outcomeOf(keluar);

    expect(isRedirectError(outcome.thrown)).toBe(true);
    expect(String((outcome.thrown as { digest: string }).digest)).toContain("/masuk?sesi=berakhir");
  });

  it("ends the Pemesan's session and goes back to Masuk", async () => {
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);
    const sessionCookies = browser.cookieHeader();

    const outcome = await outcomeOf(keluar);

    expect(isRedirectError(outcome.thrown)).toBe(true);
    const digest = String((outcome.thrown as { digest: string }).digest);
    expect(digest).toContain("/masuk");
    expect(digest).not.toContain("sesi=berakhir");
    expect(browser.has("makam.session_token")).toBe(false);
    expect(await server.runtime().identity.actorFromCookies(sessionCookies)).toBeNull();
  });
});
