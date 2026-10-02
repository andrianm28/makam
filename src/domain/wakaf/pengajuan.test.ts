import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { signedInAdminPlatform, wakafOnTestDatabase, wakifDenganEmail, type WakafSetup } from "../../../tests/support/wakaf";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);


const PENGAJUAN = {
  tujuan: "sosial" as const,
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12, Pancoran Mas",
  pin: { lat: -6.4, lng: 106.82 },
  luasM2: 1500,
  jenisBukti: "SHM",
  nazhirNama: "Yayasan Wakaf Al-Ikhlas",
};

async function ajukan(setup: WakafSetup, wakif: { accountId: string; email: string }, extra: Record<string, unknown> = {}) {
  const hasil = await setup.wakaf.ajukanWakaf(wakif, { ...PENGAJUAN, ...extra });
  if (!hasil.ok) throw new Error(`ajukanWakaf refused: ${hasil.reason}`);
  return hasil;
}

describe("Pengajuan Wakaf: a Wakif applies", () => {
  it("starts Diajukan inside Jabodetabek, told to the Wakif by email, with no staff alert", async () => {
    const setup = wakafOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const wakif = await wakifDenganEmail(setup);
    const emailSebelum = setup.email.sent.length;

    const hasil = await ajukan(setup, wakif);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    await setup.notifications.kirimPeringatanStafTick();

    expect(hasil.status).toBe("diajukan");
    expect(hasil.nomor).toMatch(/^WKF-2026-\d{6}$/);
    const staf = await setup.notifications.staffAlerts(admin);
    expect(staf.ok && staf.latest).toEqual([]);
    expect(setup.email.sent.slice(emailSebelum).map((surat) => surat.to)).toEqual(["wakif@contoh.id"]);
  });

  it("is Dirujuk at once when the kab/kota is outside Jabodetabek, with the pointer to the local KUA/BWI in the email", async () => {
    const setup = wakafOnTestDatabase(db);
    const wakif = await wakifDenganEmail(setup);

    const hasil = await ajukan(setup, wakif, { kabKota: "Kabupaten Sleman" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(hasil.status).toBe("dirujuk");
    const surat = setup.email.sent.filter((satu) => satu.to === "wakif@contoh.id").at(-1);
    expect(surat?.subject).toContain("Dirujuk");
    expect(surat?.text).toContain("KUA");
    expect(surat?.text).toContain("BWI");
  });

  it.each(["Kota Jakarta Selatan", "Kabupaten Bogor", "Kota Tangerang Selatan", "kota bekasi", "Depok", "Kab. Tangerang", "Kabupaten Kepulauan Seribu"])(
    "treats %s as inside Jabodetabek",
    async (kabKota) => {
      const setup = wakafOnTestDatabase(db);
      const wakif = await wakifDenganEmail(setup);
      expect((await ajukan(setup, wakif, { kabKota })).status).toBe("diajukan");
    },
  );

  it.each(["Kabupaten Karawang", "Kota Bandung", "Kabupaten Lebak", "Kota Serang"])("treats %s as outside Jabodetabek: Dirujuk", async (kabKota) => {
    const setup = wakafOnTestDatabase(db);
    const wakif = await wakifDenganEmail(setup);
    expect((await ajukan(setup, wakif, { kabKota })).status).toBe("dirujuk");
  });
});
