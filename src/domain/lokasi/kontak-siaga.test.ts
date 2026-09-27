import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function lokasiWithTwoAdminLokasi() {
  const setup = lokasiOnTestDatabase(db);
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  const first = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], "083333333333");
  const second = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], "084444444444");
  return { setup, admin, lokasiMitra, first, second };
}

describe("the Kontak Siaga of a Lokasi Mitra", () => {
  it("is not picked yet on a new Lokasi Mitra", async () => {
    const { setup, first, lokasiMitra } = await lokasiWithTwoAdminLokasi();

    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toEqual({ ok: true, kontakSiaga: null });
  });

  it("an Admin Lokasi picks one of its Lokasi's Admin Lokasi as the Kontak Siaga; the pick is in its Lokasi's Audit Log", async () => {
    const { setup, first, second, lokasiMitra } = await lokasiWithTwoAdminLokasi();

    expect(await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: second.accountId })).toEqual({ ok: true });

    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toEqual({
      ok: true,
      kontakSiaga: { accountId: second.accountId, email: "lokasi-084444444444@contoh.id", name: "", phoneNumber: "+6284444444444" },
    });
    expect(await setup.lokasi.kontakSiagaOf(lokasiMitra.id)).toMatchObject({ accountId: second.accountId });
    const log = await setup.lokasi.auditLog(first, lokasiMitra.id);
    expect(log.ok && log.entries.at(-1)).toMatchObject({
      actor: { accountId: first.accountId, role: "admin_lokasi" },
      action: "lokasi.pilih_kontak_siaga",
      lokasiId: lokasiMitra.id,
      before: { kontakSiaga: null },
      after: { kontakSiaga: { accountId: second.accountId } },
    });
  });

  it("picking anyone who is not an Admin Lokasi of this Lokasi is rejected, and the Kontak Siaga stays as it was", async () => {
    const { setup, admin, first, lokasiMitra } = await lokasiWithTwoAdminLokasi();
    const otherLokasi = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const elsewhere = await signedInAdminLokasi(setup, admin, [otherLokasi.id], "085555555555");
    await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: first.accountId });

    for (const accountId of [admin.accountId, elsewhere.accountId, "bukan-akun"]) {
      expect(await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId })).toEqual({
        ok: false,
        reason: "bukan_admin_lokasi_di_sini",
      });
    }
    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toMatchObject({ kontakSiaga: { accountId: first.accountId } });
  });

  it("an Admin Lokasi of another Lokasi cannot pick this Lokasi's Kontak Siaga", async () => {
    const { setup, admin, first, lokasiMitra } = await lokasiWithTwoAdminLokasi();
    const otherLokasi = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const elsewhere = await signedInAdminLokasi(setup, admin, [otherLokasi.id], "085555555555");

    expect(await setup.lokasi.pickKontakSiaga(elsewhere, lokasiMitra.id, { accountId: first.accountId })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });

  it("removing the Kontak Siaga's Admin Lokasi from the Lokasi forces a new pick", async () => {
    const { setup, admin, first, second, lokasiMitra } = await lokasiWithTwoAdminLokasi();
    await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: second.accountId });

    await setup.lokasi.removeAdminLokasi(admin, lokasiMitra.id, { accountId: second.accountId, reason: "Pindah tugas" });

    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toEqual({ ok: true, kontakSiaga: null });
    expect(await setup.lokasi.kontakSiagaOf(lokasiMitra.id)).toBeNull();
    expect(await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: first.accountId })).toEqual({ ok: true });
  });

  it("deactivating the Kontak Siaga's Akun Staf forces a new pick", async () => {
    const { setup, admin, first, second, lokasiMitra } = await lokasiWithTwoAdminLokasi();
    await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: second.accountId });

    await setup.identity.deactivateStaff(admin, { accountId: second.accountId, reason: "Berhenti bekerja" });

    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toEqual({ ok: true, kontakSiaga: null });
  });

  it("an Admin Lokasi removed and later invited again is not the Kontak Siaga again until picked again", async () => {
    const { setup, admin, first, second, lokasiMitra } = await lokasiWithTwoAdminLokasi();
    await setup.lokasi.pickKontakSiaga(first, lokasiMitra.id, { accountId: second.accountId });
    await setup.lokasi.removeAdminLokasi(admin, lokasiMitra.id, { accountId: second.accountId, reason: "Salah Lokasi" });
    setup.clock.advance({ minutes: 5 });

    await signedInAdminLokasi(setup, admin, [lokasiMitra.id], "084444444444");

    expect(await setup.lokasi.kontakSiaga(first, lokasiMitra.id)).toEqual({ ok: true, kontakSiaga: null });
  });
});
