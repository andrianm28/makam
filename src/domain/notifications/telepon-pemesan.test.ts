import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";
import { siapkanOperator, terbitkanPerpanjangan } from "../../../tests/support/notifications-messages";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Telepon Pemesan: a money message that finally fails", () => {
  it("after 3 retries a failed Tagihan email is gagal and opens one Telepon Pemesan row, never two", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
    setup.email.failNextSend(4);

    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    setup.clock.set(wib("2026-10-01 10:15"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    setup.clock.set(wib("2026-10-01 11:15"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    setup.clock.set(wib("2026-10-01 15:15"));
    const hasil = await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(hasil.gagal).toBe(1);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ template: "tagihan_terbit", status: "gagal", attempts: 4 })]),
    );
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([
      expect.objectContaining({
        subjectKind: "tagihan",
        subjectId: tagihan.id,
        nomorTagihan: tagihan.nomorTagihan,
        sebab: "pesan_gagal",
      }),
    ]);

    setup.clock.set(wib("2026-10-01 19:15"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);
  });
});

describe("Telepon Pemesan: an order with no email", () => {
  it("a Tagihan announced with no email opens a Telepon Pemesan row at once, and queues no message", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, null);

    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([
      expect.objectContaining({ subjectKind: "tagihan", subjectId: tagihan.id, sebab: "tanpa_email" }),
    ]);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual([]);

    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(setup.email.sent.filter((message) => message.subject.includes(tagihan.nomorTagihan))).toEqual([]);
    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);
  });
});

describe("Telepon Pemesan: logging the call closes the row", () => {
  it("an Admin Platform logs the call: the row closes, a second log is refused, and the write is audited", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    await terbitkanPerpanjangan(setup, null);
    const [terbuka] = await setup.notifications.teleponPemesanTerbuka();
    if (!terbuka) throw new Error("no Telepon Pemesan row");

    const dicatat = await setup.notifications.catatPanggilan(admin, {
      teleponId: terbuka.id,
      hasil: "sudah_dihubungi",
      catatan: "Keluarga janji bayar besok pagi",
    });
    expect(dicatat).toMatchObject({ ok: true, telepon: { id: terbuka.id } });
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);

    expect(await setup.notifications.catatPanggilan(admin, { teleponId: terbuka.id, hasil: "tidak_diangkat" })).toEqual({
      ok: false,
      reason: "sudah_ditutup",
    });

    const entries = await setup.audit.entriesAbout({ kind: "telepon_pemesan", id: terbuka.id });
    expect(entries).toEqual([
      expect.objectContaining({ action: "telepon_pemesan.catat_panggilan", after: { hasil: "sudah_dihubungi" } }),
    ]);
  });

  it("an unknown row is not found, garbage is invalid, and a non-staff caller is refused", async () => {
    const setup = notificationsOnTestDatabase(db);
    const { admin } = await siapkanOperator(setup);
    const { cookies } = await logIn(setup, "keluarga@contoh.id");
    const pemesan = await actorOf(setup.identity, cookies);

    expect(
      await setup.notifications.catatPanggilan(admin, { teleponId: "123e4567-e89b-12d3-a456-426614174000", hasil: "tidak_diangkat" }),
    ).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.notifications.catatPanggilan(admin, { teleponId: "bukan-uuid", hasil: "tidak_diangkat" })).toEqual({
      ok: false,
      reason: "telepon_tidak_valid",
    });
    expect(await setup.notifications.catatPanggilan(pemesan, { teleponId: "123e4567-e89b-12d3-a456-426614174000", hasil: "tidak_diangkat" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});
