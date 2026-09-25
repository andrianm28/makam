import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { browser } from "../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { testServerRuntime } from "../../../tests/support/server-runtime";
import { keluar } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../tests/support/next-request"));

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
  it("is refused by the guard when there is no session, and does not redirect as if it worked", async () => {
    const outcome = await outcomeOf(keluar);

    expect(outcome).toHaveProperty("thrown");
    expect(isRedirectError(outcome.thrown)).toBe(false);
    expect(outcome.thrown).toMatchObject({ error: "belum_masuk" });
  });

  it("ends the Pemesan's session and goes back to Masuk", async () => {
    const login = await server.logIn("081234567890");
    browser.store(login.session.cookies);
    const sessionCookies = browser.cookieHeader();

    const outcome = await outcomeOf(keluar);

    expect(isRedirectError(outcome.thrown)).toBe(true);
    expect(String((outcome.thrown as { digest: string }).digest)).toContain("/masuk");
    expect(browser.has("makam.session_token")).toBe(false);
    expect(await server.runtime().identity.actorFromCookies(sessionCookies)).toBeNull();
  });
});
