import type { Actor } from "@/domain/identity";
import { browser } from "./next-request";
import type { testServerRuntime } from "./server-runtime";
import { authenticatorCode } from "./totp";

type Server = ReturnType<typeof testServerRuntime>;

/** The actor this test browser's session cookie resolves to. */
async function browserActor(server: Server): Promise<Actor> {
  const actor = await server.runtime().identity.actorFromCookies(browser.cookieHeader());
  if (!actor) throw new Error("the browser is not signed in");
  return actor;
}

/** Seeds the first Admin Platform and signs it in in the test browser, past TOTP. Returns its actor. */
export async function signInAsAdminPlatform(server: Server, email = "admin@makam.co.id"): Promise<Actor> {
  const { identity } = server.runtime();
  const seeded = await identity.seedFirstAdminPlatform({ email, phoneNumber: "081111111111" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  browser.reset();
  browser.store((await server.logIn(email)).session.cookies);
  const enrolment = await identity.startTotpEnrolment(await browserActor(server));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(await browserActor(server), authenticatorCode(enrolment.secret, server.clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  return browserActor(server);
}

/**
 * Invites an Admin Lokasi to one Lokasi Mitra as `admin`, then signs it in in
 * the test browser instead (the browser's earlier session is dropped).
 */
export async function signInAsAdminLokasi(
  server: Server,
  admin: Actor,
  lokasiId: string,
  email = "lokasi@contoh.id",
): Promise<Actor> {
  const invited = await server.runtime().lokasi.inviteAdminLokasi(admin, lokasiId, { email, phoneNumber: "083333333333" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  browser.reset();
  browser.store((await server.logIn(email)).session.cookies);
  return browserActor(server);
}
