import { describe, expect, it } from "vitest";
import {
  akunResource,
  auditLogResource,
  authorize,
  pengaturanOperatorResource,
  lokasiMitraResource,
  semuaLokasiMitraResource,
  stafMenuResource,
  stafResource,
  tarifGlobalResource,
  type Actor,
  type Role,
} from "./index";

const pemesan: Actor = { accountId: "akun-1", email: "sari@contoh.id", phoneNumber: "+6281234567890", roles: ["pemesan"], lokasiIds: [], totp: "tidak_perlu", sessionId: "sesi-1" };

function staff(roles: Role[], totp: Actor["totp"] = "tidak_perlu"): Actor {
  return { accountId: "akun-staf", email: "staf@makam.co.id", phoneNumber: "+6281111111111", roles: ["pemesan", ...roles], lokasiIds: [], totp, sessionId: "sesi-staf" };
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
  it("only Admin Platform may invite staff, deactivate an Akun Staf or do a Pemulihan Akun", () => {
    for (const action of ["staf.undang", "staf.nonaktifkan", "akun.pemulihan"] as const) {
      expect(authorize(adminPlatform, action, stafResource())).toEqual({ allowed: true });
      for (const role of ["admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const) {
        expect(authorize(staff([role]), action, stafResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
      }
      expect(authorize(pemesan, action, stafResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
    }
  });

  it("only Admin Platform lists every Lokasi Mitra (lokasi.lihat_semua); an Admin Lokasi, even of one, does not", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };

    expect(authorize(adminPlatform, "lokasi.lihat_semua", semuaLokasiMitraResource())).toEqual({ allowed: true });
    for (const actor of [adminLokasi, staff(["petugas_lapangan", "mitra_jasa"]), pemesan]) {
      expect(authorize(actor, "lokasi.lihat_semua", semuaLokasiMitraResource())).toEqual({
        allowed: false,
        reason: "tidak_berwenang",
      });
    }
    // Listing is about the whole list, not one Lokasi Mitra.
    expect(authorize(adminPlatform, "lokasi.lihat_semua", lokasiMitraResource(lokasiId))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
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

describe("who may write tariffs (tarif.ubah)", () => {
  it("only an Admin Platform past TOTP, for a Lokasi Mitra's tariffs and the global ones; never an Admin Lokasi, even of that Lokasi", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };
    const write = (who: Actor) => [
      authorize(who, "tarif.ubah", lokasiMitraResource(lokasiId)),
      authorize(who, "tarif.ubah", tarifGlobalResource()),
    ];

    expect(write(adminPlatform)).toEqual([{ allowed: true }, { allowed: true }]);
    expect(write(staff(["admin_platform"], "perlu_verifikasi"))).toEqual([
      { allowed: false, reason: "perlu_totp" },
      { allowed: false, reason: "perlu_totp" },
    ]);
    for (const who of [adminLokasi, staff(["petugas_lapangan", "mitra_jasa"]), pemesan]) {
      expect(write(who)).toEqual([
        { allowed: false, reason: "tidak_berwenang" },
        { allowed: false, reason: "tidak_berwenang" },
      ]);
    }
    expect(authorize(adminPlatform, "tarif.ubah", stafResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
  });
});

describe("who may build a Lokasi Mitra's Denah (denah.ubah)", () => {
  it("only that Lokasi's own Admin Lokasi, past TOTP if it also holds Admin Platform; not Admin Platform, and not another Lokasi's Admin Lokasi", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const otherLokasiId = "5d1f4c2e-0000-4000-8000-000000000002";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };
    const adminLokasiElsewhere = { ...staff(["admin_lokasi"]), lokasiIds: [otherLokasiId] };

    expect(authorize(adminLokasi, "denah.ubah", lokasiMitraResource(lokasiId))).toEqual({ allowed: true });
    for (const who of [adminPlatform, adminLokasiElsewhere, staff(["petugas_lapangan", "mitra_jasa"]), pemesan]) {
      expect(authorize(who, "denah.ubah", lokasiMitraResource(lokasiId))).toEqual({
        allowed: false,
        reason: "tidak_berwenang",
      });
    }
  });

  it("an Admin Lokasi that also holds Admin Platform without TOTP still can't build the Denah", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const notYet = { ...staff(["admin_platform", "admin_lokasi"], "perlu_verifikasi"), lokasiIds: [lokasiId] };
    expect(authorize(notYet, "denah.ubah", lokasiMitraResource(lokasiId))).toEqual({
      allowed: false,
      reason: "perlu_totp",
    });
  });
});

describe("who may complete a Hak Pakai flagged Perlu Verifikasi (hak_pakai.selesaikan_verifikasi)", () => {
  it("only that Lokasi's own Admin Lokasi; not Admin Platform, and not another Lokasi's Admin Lokasi", () => {
    // The same rule as `denah.ubah` and for the same reason: the record of what
    // stands at a grave is the Lokasi's own, and the Operator chases a Lokasi by
    // phone rather than completing its records (story 117). It is this action the
    // first Perpanjangan or Layanan on a flagged Hak Pakai waits for.
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const otherLokasiId = "5d1f4c2e-0000-4000-8000-000000000002";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };
    const adminLokasiElsewhere = { ...staff(["admin_lokasi"]), lokasiIds: [otherLokasiId] };

    expect(authorize(adminLokasi, "hak_pakai.selesaikan_verifikasi", lokasiMitraResource(lokasiId))).toEqual({ allowed: true });
    for (const who of [adminPlatform, adminLokasiElsewhere, staff(["petugas_lapangan", "mitra_jasa"]), pemesan]) {
      expect(authorize(who, "hak_pakai.selesaikan_verifikasi", lokasiMitraResource(lokasiId))).toEqual({
        allowed: false,
        reason: "tidak_berwenang",
      });
    }
    // The right is the Lokasi's, not the row's: a different resource is refused.
    expect(authorize(adminLokasi, "hak_pakai.selesaikan_verifikasi", semuaLokasiMitraResource())).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
  });

  it("an Admin Lokasi that also holds Admin Platform without TOTP still can't complete it", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const notYet = { ...staff(["admin_platform", "admin_lokasi"], "perlu_verifikasi"), lokasiIds: [lokasiId] };
    expect(authorize(notYet, "hak_pakai.selesaikan_verifikasi", lokasiMitraResource(lokasiId))).toEqual({
      allowed: false,
      reason: "perlu_totp",
    });
  });
});

describe("who may review a manual Perpanjangan request and record a holder (perpanjangan.periksa, hak_pakai.ubah_pemegang)", () => {
  it("only that Lokasi's own Admin Lokasi: not Admin Platform, another Lokasi's Admin Lokasi, other staff or a family", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const otherLokasiId = "5d1f4c2e-0000-4000-8000-000000000002";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };
    const adminLokasiElsewhere = { ...staff(["admin_lokasi"]), lokasiIds: [otherLokasiId] };

    for (const action of ["perpanjangan.periksa", "hak_pakai.ubah_pemegang"] as const) {
      expect(authorize(adminLokasi, action, lokasiMitraResource(lokasiId))).toEqual({ allowed: true });
      for (const who of [adminPlatform, adminLokasiElsewhere, staff(["petugas_lapangan", "mitra_jasa"]), pemesan]) {
        expect(authorize(who, action, lokasiMitraResource(lokasiId))).toEqual({ allowed: false, reason: "tidak_berwenang" });
      }
      expect(authorize(adminLokasi, action, semuaLokasiMitraResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
    }
  });
});

describe("who may see a Lokasi Mitra's Denah (denah.lihat)", () => {
  it("Admin Platform sees every Lokasi Mitra's Denah; an Admin Lokasi only its own", () => {
    const lokasiId = "5d1f4c2e-0000-4000-8000-000000000001";
    const otherLokasiId = "5d1f4c2e-0000-4000-8000-000000000002";
    const adminLokasi = { ...staff(["admin_lokasi"]), lokasiIds: [lokasiId] };

    expect(authorize(adminPlatform, "denah.lihat", lokasiMitraResource(lokasiId))).toEqual({ allowed: true });
    expect(authorize(adminLokasi, "denah.lihat", lokasiMitraResource(lokasiId))).toEqual({ allowed: true });
    expect(authorize(adminLokasi, "denah.lihat", lokasiMitraResource(otherLokasiId))).toEqual({
      allowed: false,
      reason: "tidak_berwenang",
    });
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
