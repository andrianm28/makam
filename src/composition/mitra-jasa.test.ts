import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { layananOnTestDatabase, newMitraJasaInput, signedInAdminPlatform } from "../../tests/support/layanan";
import { mulaiOnboardingMitraJasa } from "./mitra-jasa";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("onboarding a Mitra Jasa in one call", () => {
  it("creates the record and sends the Undangan Staf to its email", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const profil = newMitraJasaInput();

    const hasil = await mulaiOnboardingMitraJasa(setup, admin, { email: "baru@contoh.id", nomorTelepon: "085555555555", profil });

    expect(hasil).toMatchObject({ ok: true });
    expect(await setup.layanan.semuaMitraJasa(admin)).toHaveLength(1);
    expect((await setup.identity.openStaffInvites()).map((undangan) => [undangan.email, undangan.role])).toEqual([["baru@contoh.id", "mitra_jasa"]]);
  });

  it("a retry after the invite was never sent sends it, instead of refusing sudah_ada", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const profil = newMitraJasaInput();
    // The first attempt got as far as the record and no further.
    const pertama = await setup.layanan.buatMitraJasa(admin, "baru@contoh.id", profil);
    if (!pertama.ok) throw new Error(pertama.reason);
    expect(await setup.identity.openStaffInvites()).toEqual([]);

    const ulang = await mulaiOnboardingMitraJasa(setup, admin, { email: "Baru@contoh.id", nomorTelepon: "085555555555", profil });

    expect(ulang).toEqual({ ok: true, mitraJasaId: pertama.mitraJasaId });
    expect(await setup.layanan.semuaMitraJasa(admin)).toHaveLength(1);
    expect(await setup.identity.openStaffInvites()).toHaveLength(1);
  });

  it("a second retry, once the invite is out, is a duplicate and sends nothing more", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const masuk = { email: "baru@contoh.id", nomorTelepon: "085555555555", profil: newMitraJasaInput() };
    await mulaiOnboardingMitraJasa(setup, admin, masuk);

    expect(await mulaiOnboardingMitraJasa(setup, admin, masuk)).toEqual({ ok: false, reason: "sudah_ada" });
    expect(await setup.identity.openStaffInvites()).toHaveLength(1);
  });

  it("another person's NIK on an existing email is still refused, and invites nobody", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const pertama = await setup.layanan.buatMitraJasa(admin, "baru@contoh.id", newMitraJasaInput({ nik: "3201014503900001" }));
    if (!pertama.ok) throw new Error(pertama.reason);

    const hasil = await mulaiOnboardingMitraJasa(setup, admin, {
      email: "baru@contoh.id",
      nomorTelepon: "085555555555",
      profil: newMitraJasaInput({ nik: "3201014503900002" }),
    });

    expect(hasil).toEqual({ ok: false, reason: "sudah_ada" });
    expect(await setup.identity.openStaffInvites()).toEqual([]);
  });
});
