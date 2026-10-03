import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase, signedInAdminPlatform } from "../../../tests/support/queues";
import { terbitanPerpanjangan } from "../../../tests/support/notifications-messages";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Antrean: Tier 2 Telepon Pemesan", () => {
  it("a money message that finally fails opens a Tier 2 row that alerts, and logging the call closes it", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
    if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitanPerpanjangan(setup, "keluarga@contoh.id");

    expect(await setup.queues.antrean(admin)).toEqual([]);

    setup.email.failNextSend(4);
    for (const jam of ["2026-10-01 10:00", "2026-10-01 10:15", "2026-10-01 11:15", "2026-10-01 15:15"]) {
      setup.clock.set(wib(jam));
      await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    }

    const rows = await setup.queues.antrean(admin);
    const telepon = rows.find((row) => row.type === "telepon_pemesan");
    expect(telepon).toMatchObject({
      tier: 2,
      label: "Telepon Pemesan",
      subjectKind: "telepon_pemesan",
      alerts: false,
      pastDeadline: false,
      ambil: null,
    });
    expect(telepon?.subjectLabel).toContain(tagihan.nomorTagihan);

    const [terbuka] = await setup.notifications.teleponPemesanTerbuka();
    if (!terbuka) throw new Error("no Telepon Pemesan row");
    const dicatat = await setup.notifications.catatPanggilan(admin, { teleponId: terbuka.id, hasil: "sudah_dihubungi" });
    expect(dicatat.ok).toBe(true);
    expect((await setup.queues.antrean(admin)).some((row) => row.type === "telepon_pemesan")).toBe(false);
  });

  it("is named in the CONTEXT.md words, and says in the Antrean why each one was opened", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
    if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    // One order CS submitted with no email, one whose email never gets through.
    const tanpaEmail = await terbitanPerpanjangan(setup, null);
    await terbitanPerpanjangan(setup, "keluarga@contoh.id");
    setup.email.failNextSend(4);
    for (const jam of ["2026-10-01 10:00", "2026-10-01 10:15", "2026-10-01 11:15", "2026-10-01 15:15"]) {
      setup.clock.set(wib(jam));
      await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    }

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === "telepon_pemesan");
    expect(rows.map((row) => row.label)).toEqual(["Telepon Pemesan", "Telepon Pemesan"]);
    const labels = rows.map((row) => row.subjectLabel).sort();
    expect(labels[0]).toBe(`${tanpaEmail.tagihan.nomorTagihan} · pesanan tanpa email`);
    expect(labels[1]).toContain("email gagal terkirim");
  });

  it("shows a Makam TPU whose IPTM is ending with no email on record as one row naming what to tell the Pemegang Hak", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-11-15 10:00"));
    const pengingat = {
      makamTpuId: "5b0b4a54-7c33-4d9e-9a55-6a0f4d1b2c3d",
      kunci: "2027-02-15:3",
      tpuName: "TPU Karet Bivak",
      blokNomor: "Blok B-12 No. 34",
      pemegangHakName: "Budi Santoso",
      email: null,
      berlakuSampai: "2027-02-15",
      sisaBulan: 3 as const,
      tautan: "https://makam.test/perpanjang-iptm/x",
    };
    await setup.notifications.pengingatIptmBerakhir(pengingat);
    await setup.notifications.pengingatIptmBerakhir(pengingat);

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === "telepon_pemesan");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 2, label: "Telepon Pemesan" });
    expect(rows[0]?.subjectLabel).toContain("Blok B-12 No. 34");
    expect(rows[0]?.subjectLabel).toContain("TPU Karet Bivak");
  });
});
