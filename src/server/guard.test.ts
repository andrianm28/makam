import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Actor } from "@/domain/identity";
import { guarded } from "./guard";

const pemesan: Actor = { accountId: "akun-1", phoneNumber: "+6281234567890", roles: ["pemesan"] };
const schema = z.object({ nama: z.string().min(1) });

function signOutOwnAccount(actor: Actor | null, input: unknown) {
  return guarded({
    actor,
    action: "akun.keluar",
    resource: (signedIn) => ({ kind: "akun", accountId: signedIn.accountId }),
    schema,
    input,
    run: async (signedIn, data) => `${signedIn.accountId}:${data.nama}`,
  });
}

describe("a guarded Server Action", () => {
  it("rejects a caller who is not signed in, whatever they send", async () => {
    expect(await signOutOwnAccount(null, { nama: "Budi" })).toEqual({ ok: false, error: "belum_masuk" });
    expect(await signOutOwnAccount(null, { nama: 42 })).toEqual({ ok: false, error: "belum_masuk" });
  });

  it("rejects a signed-in Pemesan acting on another account", async () => {
    const result = await guarded({
      actor: pemesan,
      action: "akun.lihat",
      resource: () => ({ kind: "akun", accountId: "akun-2" }),
      schema,
      input: { nama: "Budi" },
      run: async () => "ran",
    });
    expect(result).toEqual({ ok: false, error: "tidak_berwenang" });
  });

  it("rejects input that fails its Zod schema", async () => {
    expect(await signOutOwnAccount(pemesan, { nama: "" })).toEqual({ ok: false, error: "input_tidak_valid" });
  });

  it("runs the domain call with the signed-in actor and the parsed input", async () => {
    expect(await signOutOwnAccount(pemesan, { nama: "Budi" })).toEqual({ ok: true, value: "akun-1:Budi" });
  });
});
