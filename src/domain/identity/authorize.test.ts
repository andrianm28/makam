import { describe, expect, it } from "vitest";
import {
  akunResource,
  auditLogResource,
  authorize,
  pengaturanOperatorResource,
  stafMenuResource,
  stafResource,
  type Actor,
  type Role,
} from "./index";

const pemesan: Actor = { accountId: "akun-1", phoneNumber: "+6281234567890", roles: ["pemesan"], totp: "tidak_perlu", sessionId: "sesi-1" };

function staff(roles: Role[], totp: Actor["totp"] = "tidak_perlu"): Actor {
  return { accountId: "akun-staf", phoneNumber: "+6281111111111", roles: ["pemesan", ...roles], totp, sessionId: "sesi-staf" };
}

const adminPlatform = staff(["admin_platform"], "lolos");

describe("authorize(actor, action, resource)", () => {
  it("rejects every action from someone who is not signed in", () => {
    expect(authorize(null, "akun.lihat", akunResource("akun-1"))).toEqual({
      allowed: false,
      reason: "belum_masuk",
    });
    expect(authorize(null, "akun.keluar", akunResource("akun-1"))).toEqual({
      allowed: false,
      reason: "belum_masuk",
    });
  });

  it("lets a Pemesan open Akun Saya and sign out of their own account", () => {
    expect(authorize(pemesan, "akun.lihat", akunResource("akun-1"))).toEqual({ allowed: true });
    expect(authorize(pemesan, "akun.keluar", akunResource("akun-1"))).toEqual({ allowed: true });
  });

  it("does not let a Pemesan act on another account", () => {
    expect(authorize(pemesan, "akun.lihat", akunResource("akun-2"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });
});

describe("who may read the Audit Log", () => {
  it("denies Mitra Jasa and Petugas Lapangan any Audit Log read", () => {
    expect(authorize(staff(["mitra_jasa"]), "audit.lihat", auditLogResource())).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(authorize(staff(["petugas_lapangan"]), "audit.lihat", auditLogResource())).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(authorize(pemesan, "audit.lihat", auditLogResource())).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });

  it("lets Admin Platform read the whole Audit Log; an Admin Lokasi gets only its Lokasi's view (ticket 10), not the whole log", () => {
    expect(authorize(adminPlatform, "audit.lihat", auditLogResource())).toEqual({ allowed: true });
    expect(authorize(staff(["admin_lokasi"]), "audit.lihat", auditLogResource())).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });
});

describe("staff access", () => {
  it("only Admin Platform may invite staff, deactivate an Akun Staf or move an Akun to a new number", () => {
    for (const action of ["staf.undang", "staf.nonaktifkan", "akun.pindah_nomor"] as const) {
      expect(authorize(adminPlatform, action, stafResource())).toEqual({ allowed: true });
      for (const role of ["admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const) {
        expect(authorize(staff([role]), action, stafResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
      }
      expect(authorize(pemesan, action, stafResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
    }
  });

  it("each role sees only its own menu in the staff area", () => {
    const petugasAndMitra = staff(["petugas_lapangan", "mitra_jasa"]);
    expect(authorize(petugasAndMitra, "staf.menu", stafMenuResource("petugas_lapangan"))).toEqual({ allowed: true });
    expect(authorize(petugasAndMitra, "staf.menu", stafMenuResource("mitra_jasa"))).toEqual({ allowed: true });
    expect(authorize(petugasAndMitra, "staf.menu", stafMenuResource("admin_lokasi"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(authorize(petugasAndMitra, "staf.menu", stafMenuResource("admin_platform"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(authorize(pemesan, "staf.menu", stafMenuResource("admin_lokasi"))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });

  it("an Akun holding Admin Platform that has not passed TOTP may do nothing but TOTP and Keluar, whatever other roles it holds", () => {
    for (const totp of ["perlu_daftar", "perlu_verifikasi"] as const) {
      const notYet = staff(["admin_platform", "admin_lokasi"], totp);
      expect(authorize(notYet, "staf.menu", stafMenuResource("admin_lokasi"))).toEqual({
        allowed: false,
        reason: "perlu_totp",
      });
      expect(authorize(notYet, "staf.undang", stafResource())).toEqual({ allowed: false, reason: "perlu_totp" });
      expect(authorize(notYet, "audit.lihat", auditLogResource())).toEqual({ allowed: false, reason: "perlu_totp" });
      expect(authorize(notYet, "akun.lihat", akunResource("akun-staf"))).toEqual({
        allowed: false,
        reason: "perlu_totp",
      });
      expect(authorize(notYet, "akun.totp", akunResource("akun-staf"))).toEqual({ allowed: true });
      expect(authorize(notYet, "akun.keluar", akunResource("akun-staf"))).toEqual({ allowed: true });
    }
  });
});

describe("who may open the Pengaturan Operator screen", () => {
  it("only an Admin Platform past TOTP; no other role, not even one holding several", () => {
    const open = (who: Actor) => authorize(who, "pengaturan_operator.lihat", pengaturanOperatorResource());

    expect(open(adminPlatform)).toEqual({ allowed: true });
    expect(open(staff(["admin_platform"], "perlu_verifikasi"))).toEqual({ allowed: false, reason: "perlu_totp" });
    expect(open(staff(["admin_lokasi", "petugas_lapangan", "mitra_jasa"]))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
    expect(open(pemesan)).toEqual({ allowed: false, reason: "tidak_berwenang" });
  });
});
