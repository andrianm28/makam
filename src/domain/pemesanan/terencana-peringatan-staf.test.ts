/**
 * The Peringatan Staf a new Pemesanan Terencana raises (ticket 97): the Lokasi
 * Mitra's Admin Lokasi and its Kontak Siaga hear of it once, at any hour, by
 * bell + email + web push. Nothing after that: the Antrean Lokasi's
 * "Konfirmasi Terencana" row (Lainnya) stays the only follow-up.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, adminPlatformOf, logIn } from "../../../tests/support/identity";
import { browserPushSubscription } from "../../../tests/support/notifications";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const dataPemesan = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" },
  calonPenghuni: { mode: "saya" },
} as const;

async function siap(setup: PemesananSetup) {
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup);
  const fixture = await terencanaLokasi(setup, admin);
  await setup.notifications.enablePush(fixture.adminLokasi, { subscription: browserPushSubscription() });
  const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
  return { admin, fixture, pemesan };
}

async function pesan(setup: PemesananSetup, dasar: Awaited<ReturnType<typeof siap>>, nomorPetak = ["A-01", "A-02"]) {
  const id = await unitIds(setup, dasar.fixture, nomorPetak);
  const hasil = await setup.pemesanan.placeTerencana({
    ...dataPemesan,
    pemesan: dasar.pemesan,
    lokasiId: dasar.fixture.lokasiMitra.id,
    units: nomorPetak.map((nomor) => ({ petakId: id[nomor] })),
  });
  if (!hasil.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(hasil)}`);
  return hasil.pemesanan;
}

async function peringatanTerencana(setup: PemesananSetup, accountId: string) {
  return (await setup.notifications.pesanStaf(accountId)).filter((satu) => satu.template === "staf_terencana_baru");
}

describe("the Peringatan Staf of a new Pemesanan Terencana", () => {
  it("reaches the Lokasi's Admin Lokasi once, by bell, email and web push", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    const admin = dasar.fixture.adminLokasi;

    const order = await pesan(setup, dasar);

    const pesanStaf = await peringatanTerencana(setup, admin.accountId);
    expect(pesanStaf.map((satu) => satu.channel).sort()).toEqual(["email", "push"]);
    expect(pesanStaf.find((satu) => satu.channel === "email")?.subject).toContain(order.nomor);
    const bell = await setup.notifications.staffAlerts(admin);
    expect(bell).toMatchObject({ ok: true, unread: 1 });
    expect(JSON.stringify(bell)).toContain(`/staf/admin-lokasi/${dasar.fixture.lokasiMitra.id}/pesanan/${order.nomor}`);
    expect(JSON.stringify(bell)).toContain(dasar.fixture.lokasiMitra.name);
    expect(setup.webPush.sent).toHaveLength(1);
    expect(setup.webPush.sent[0].notification.body).toContain(order.nomor);
  });

  it("names the Lokasi, the Nomor Pemesanan and how many plots, and sets no deadline", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);

    const order = await pesan(setup, dasar);

    const email = setup.email.sent.filter((satu) => satu.subject?.includes(order.nomor)).at(-1);
    expect(email?.text).toContain(dasar.fixture.lokasiMitra.name);
    expect(email?.text).toContain(order.nomor);
    expect(email?.text).toContain("2 petak/kavling");
    expect(email?.text).not.toMatch(/paling lambat/i);
  });

  it("is sent when the Lokasi is closed: a Sunday at 03:00 WIB, outside its Jam Operasional", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    setup.clock.set(wib("2026-10-04 03:00"));

    await pesan(setup, dasar);

    expect(setup.webPush.sent).toHaveLength(1);
    expect(await peringatanTerencana(setup, dasar.fixture.adminLokasi.accountId)).toHaveLength(2);
  });

  it("reaches a Kontak Siaga who is another Admin Lokasi of the Lokasi, once each, and nobody who is not one", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    const email = "kontak.siaga@contoh.id";
    const invited = await setup.lokasi.inviteAdminLokasi(dasar.admin, dasar.fixture.lokasiMitra.id, { email, phoneNumber: "083333333399" });
    if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
    const { cookies } = await logIn(setup, email);
    const kontak = await actorOf(setup.identity, cookies);
    const pick = await setup.lokasi.pickKontakSiaga(dasar.admin, dasar.fixture.lokasiMitra.id, { accountId: kontak.accountId });
    if (!pick.ok) throw new Error(`kontak siaga refused: ${pick.reason}`);

    await pesan(setup, dasar);

    expect(await peringatanTerencana(setup, dasar.fixture.adminLokasi.accountId)).toHaveLength(2);
    // The Kontak Siaga holds no Perangkat Push, so its one alert goes by email alone.
    expect((await peringatanTerencana(setup, kontak.accountId)).map((satu) => satu.channel)).toEqual(["email"]);
    expect(await setup.notifications.pesanStaf(dasar.pemesan.accountId)).toEqual([]);
  });

  it("is not sent to another Lokasi's Admin Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    // A second Kode Masuk login within the resend cooldown is refused, as a person would find.
    setup.clock.advance({ minutes: 2 });
    const lain = await terencanaLokasi(setup, dasar.admin, { name: "Makam Lain", phoneNumberAdminLokasi: "083333333344" });
    expect(lain.adminLokasi.accountId).not.toBe(dasar.fixture.adminLokasi.accountId);

    await pesan(setup, dasar);

    expect(await setup.notifications.pesanStaf(lain.adminLokasi.accountId)).toEqual([]);
  });

  it("is not repeated when the Lokasi confirms or declines an order", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    const pertama = await pesan(setup, dasar, ["A-01"]);
    const kedua = await pesan(setup, dasar, ["A-02"]);
    const admin = dasar.fixture.adminLokasi;
    // One alert per new order, each by email and by push.
    expect(await peringatanTerencana(setup, admin.accountId)).toHaveLength(4);

    await setup.pemesanan.konfirmasiTerencana(admin, { nomor: pertama.nomor });
    await setup.pemesanan.tolakTerencana(admin, { nomor: kedua.nomor, alasan: "petak_tidak_tersedia" });

    expect(await peringatanTerencana(setup, admin.accountId)).toHaveLength(4);
  });

  it("still places the order when the alert email cannot be sent", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const dasar = await siap(setup);
    setup.email.failNextSend();

    const order = await pesan(setup, dasar);

    expect(await setup.pemesanan.terencanaOf(order.nomor, dasar.pemesan)).toMatchObject({ status: "diajukan" });
    const email = (await peringatanTerencana(setup, dasar.fixture.adminLokasi.accountId)).find((satu) => satu.channel === "email");
    expect(email).toMatchObject({ status: "gagal" });
  });
});
