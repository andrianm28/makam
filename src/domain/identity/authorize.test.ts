import { describe, expect, it } from "vitest";
import { authorize, type Actor } from "./index";

const pemesan: Actor = { accountId: "akun-1", phoneNumber: "+6281234567890", roles: ["pemesan"] };

describe("authorize(actor, action, resource)", () => {
  it("rejects every action from someone who is not signed in", () => {
    expect(authorize(null, "akun.lihat", { kind: "akun", accountId: "akun-1" })).toEqual({
      allowed: false,
      reason: "belum_masuk",
    });
    expect(authorize(null, "akun.keluar", { kind: "akun", accountId: "akun-1" })).toEqual({
      allowed: false,
      reason: "belum_masuk",
    });
  });

  it("lets a Pemesan open Akun Saya and sign out of their own account", () => {
    expect(authorize(pemesan, "akun.lihat", { kind: "akun", accountId: "akun-1" })).toEqual({ allowed: true });
    expect(authorize(pemesan, "akun.keluar", { kind: "akun", accountId: "akun-1" })).toEqual({ allowed: true });
  });

  it("does not let a Pemesan act on another account", () => {
    expect(authorize(pemesan, "akun.lihat", { kind: "akun", accountId: "akun-2" })).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });
});
