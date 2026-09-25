import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { browser } from "../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { testServerRuntime } from "../../tests/support/server-runtime";
import { guarded } from "./guard";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const schema = z.object({ perangkat: z.string().min(1) });

/** A Server Action body: Keluar from the caller's own Akun on one device. */
function signOutOwnAccount(input: unknown) {
  return guarded({
    action: "akun.keluar",
    resource: (signedIn) => akunResource(signedIn.accountId),
    schema,
    input,
    run: async (signedIn, data) => `${signedIn.accountId}:${data.perangkat}`,
  });
}

async function signIn() {
  const login = await server.logIn("081234567890");
  browser.store(login.session.cookies);
  return login.account;
}

describe("a guarded Server Action", () => {
  it("rejects a caller with no session, whatever they send, though the action names no actor", async () => {
    expect(await signOutOwnAccount({ perangkat: "ponsel" })).toEqual({ ok: false, error: "belum_masuk" });
    expect(await signOutOwnAccount({ perangkat: 42 })).toEqual({ ok: false, error: "belum_masuk" });
  });

  it("cannot be talked out of authenticating: an actor handed in by the caller is ignored", async () => {
    const forged = { accountId: "akun-1", phoneNumber: "+6281234567890", roles: ["pemesan"] };
    const result = await guarded({
      actor: forged,
      action: "akun.keluar",
      resource: () => akunResource("akun-1"),
      schema,
      input: { perangkat: "ponsel" },
      run: async () => "ran",
    } as unknown as Parameters<typeof guarded>[0]);

    expect(result).toEqual({ ok: false, error: "belum_masuk" });
  });

  it("rejects a signed-in Pemesan acting on another Akun", async () => {
    await signIn();
    const result = await guarded({
      action: "akun.lihat",
      resource: () => akunResource("akun-lain"),
      schema,
      input: { perangkat: "ponsel" },
      run: async () => "ran",
    });
    expect(result).toEqual({ ok: false, error: "tidak_berwenang" });
  });

  it("rejects input that fails its Zod schema", async () => {
    await signIn();
    expect(await signOutOwnAccount({ perangkat: "" })).toEqual({ ok: false, error: "input_tidak_valid" });
  });

  it("runs the domain call with the signed-in Pemesan and the parsed input", async () => {
    const akun = await signIn();
    expect(await signOutOwnAccount({ perangkat: "ponsel" })).toEqual({ ok: true, value: `${akun.id}:ponsel` });
  });
});
