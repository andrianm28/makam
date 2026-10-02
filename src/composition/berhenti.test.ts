import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { adminPlatformOf } from "../../tests/support/identity";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../tests/support/layanan";
import { hentikanLokasiMitra } from "./berhenti";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Berhenti decision of a Lokasi Mitra", () => {
  it("tells every family with an order or a Paket Layanan there, the same day, with the effective date", async () => {
    const setup = layananOnTestDatabase(db);
    const admin = await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    const dibuat = await setup.layanan.buatPaket(admin, { name: "Paket Ziarah", description: "Satu Layanan.", frekuensi: "bulanan", itemIds: [lokasi.varian.id], reason: null });
    if (!dibuat.ok) throw new Error(`Paket refused: ${dibuat.reason}`);
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup, "pelanggan@contoh.id");
    const langganan = await setup.layanan.berlanggananPaket(pemesan, {
      paketId: dibuat.paket.id,
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      mulai: "2026-11-20",
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
    });
    if (!langganan.ok) throw new Error(`Berlangganan refused: ${langganan.reason}`);
    const { actor: adminPlatform } = await adminPlatformOf(setup);
    setup.clock.set(wib("2026-10-01 22:00"));

    const hasil = await hentikanLokasiMitra(
      {
        lokasi: setup.lokasi,
        // The Terencana and Saat Duka orders are the Pemesanan module's own read, tested there.
        pemesanan: { pesananBerjalanDiLokasi: async () => [{ nomor: "MKM-2026-000777", kind: "terencana", status: "aktif", email: "terencana@contoh.id" }] },
        layanan: setup.layanan,
        notifications: setup.notifications,
      },
      adminPlatform,
      lokasi.lokasiMitra.id,
      { berlakuOn: "2026-11-08", alasan: "Perjanjian berakhir" },
    );

    expect(hasil).toEqual({ ok: true, berlakuOn: "2026-11-08" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const notice = setup.email.sent.filter((surat) => surat.subject.includes("berhenti bermitra"));
    expect(notice.map((surat) => surat.to).sort()).toEqual(["pelanggan@contoh.id", "terencana@contoh.id"]);
    expect(notice[0]?.text).toContain("8 November 2026");
  });

  it("tells nobody when the decision is refused", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    const { actor: adminPlatform } = await adminPlatformOf(setup);

    const hasil = await hentikanLokasiMitra(
      { lokasi: setup.lokasi, pemesanan: { pesananBerjalanDiLokasi: async () => [{ nomor: "MKM-2026-000777", kind: "terencana", status: "aktif", email: "a@contoh.id" }] }, layanan: setup.layanan, notifications: setup.notifications },
      adminPlatform,
      lokasi.lokasiMitra.id,
      { berlakuOn: "2000-01-01" },
    );

    expect(hasil).toEqual({ ok: false, reason: "tanggal_lampau" });
    expect(setup.email.sent.filter((surat) => surat.subject.includes("berhenti bermitra"))).toEqual([]);
  });
});
