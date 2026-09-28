import { FakePdfRenderer } from "@/adapters/memory";
import { composePemesanan } from "@/composition/pemesanan";
import type { Database } from "@/db/client";
import { createPayouts, type KirimBuktiPencairan, type TerencanaTerbayar } from "@/domain/payouts";
import { createPengurusan } from "@/domain/pengurusan";
import { createQueues } from "@/domain/queues";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import { efekTerencanaSaatLunas } from "@/domain/pemesanan/efek-terencana";
import type { PaymentMethod } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { logIn } from "./identity";
import { cellsOf } from "./inventory";
import { orderSaatDuka, pemesananOnTestDatabase, pemesanDenganEmail, saatDukaFixture, siapkanOperatorPemesanan, unitIds, type LokasiOptions } from "./pemesanan";
import { terencanaLokasi } from "./terencana";
import { TEST_PUBLIC_ORIGIN } from "./billing";
import { publishOnTestDatabase, type PublishSetup } from "./publish";

/**
 * Lokasi, Tariffs, Inventory, Field Work, Billing, Notifications, the Pemesanan
 * module and Payouts together on the test Postgres, sharing one fake Clock,
 * FileStore, Identity, Audit Log, PdfRenderer and Notifications.
 *
 * Billing runs the Payouts payment effect (`efekPencairanSaatLunas`, which takes
 * no dependencies), so a Tagihan paid through the real module records the Lunas
 * half of the Pencairan trigger in the very transaction that settles it — the
 * only way to test the trigger the way it really happens. Every Bukti Pencairan
 * the Payouts module issues is collected in `dikirim`, standing in for the
 * Notifications module that carries it to its recipient in production.
 */
/**
 * The Payouts module on the setup's own modules, with every Bukti Pencairan it
 * issues collected in `dikirim`: a real recipient is reached through the
 * Notifications module, and what a test needs to see is that it was told, with
 * what.
 */
export function payoutsFor(setup: PublishSetup, pemesanan: { terencanaTerbayar(): Promise<TerencanaTerbayar[]> }) {
  const dikirim: Parameters<KirimBuktiPencairan>[0][] = [];
  const payouts = createPayouts({
    db: setup.db,
    clock: setup.clock,
    audit: setup.audit,
    files: setup.files,
    lokasi: setup.lokasi,
    // Whether an id is a Lokasi Mitra's at all, asked of the Lokasi module the way
    // the composition asks it: a Jam Operasional that is belum diisi is still a
    // Lokasi, and "not found" is the only answer that is not one.
    lokasiAda: async (lokasiId) => (await setup.lokasi.jamOperasionalOf(lokasiId)).ok,
    billing: setup.billing,
    operatorSettings: setup.operatorSettings,
    buktiUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
    pdf: new FakePdfRenderer(),
    kirimBukti: async (bukti) => {
      dikirim.push(bukti);
    },
    // The Terencairan trigger reads what a paid Pemesanan Terencana means to a
    // Pencairan through the Pemesanan module's own public read — never its tables —
    // so the trigger a test drives is the real one.
    terencanaTerbayar: () => pemesanan.terencanaTerbayar(),
  });
  return { payouts, dikirim };
}

/**
 * Lokasi, Tariffs, Inventory, Field Work, Billing, Notifications, the Pemesanan
 * module and Payouts together on the test Postgres, sharing one fake Clock,
 * FileStore, Identity, Audit Log, PdfRenderer and Notifications.
 *
 * Billing runs the Payouts payment effect (`efekPencairanSaatLunas`, which takes
 * no dependencies), so a Tagihan paid through the real module records the Lunas
 * half of the Pencairan trigger in the very transaction that settles it — the
 * only way to test the trigger the way it really happens.
 */
export function payoutsOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db, { paymentEffects: [efekPencairanSaatLunas(), efekTerencanaSaatLunas()] });
  const pemesanan = composePemesanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    identity: setup.identity,
    notifications: setup.notifications,
  });
  const { payouts, dikirim } = payoutsFor(setup, pemesanan);
  // Ticket 44 put the Pengurusan module on `PemesananSetup`, and every fixture
  // that composes the Pemesanan module itself owes one: `PemesananModul` is an
  // Omit of that setup, so a setup without it stops satisfying it. The wizard's
  // first screen is the combined Lokasi Mitra / TPU list, so it is a real
  // dependency and not a formality — the same module, built the same way.
  const pengurusan = createPengurusan({
    db,
    clock: setup.clock,
    files: setup.files,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    billing: setup.billing,
    identity: setup.identity,
  });
  // The Antrean beside it: the Tier 3 "Pencairan" row is the Payouts query the
  // Work Queues module projects, and a test of one wants the other.
  const queues = createQueues({
    db,
    clock: setup.clock,
    audit: setup.audit,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    billing: setup.billing,
    notifications: setup.notifications,
    inventory: setup.inventory,
    pemesanan,
    payouts,
  });
  return { ...setup, pemesanan, pengurusan, payouts, dikirim, queues };
}

export type PayoutsSetup = ReturnType<typeof payoutsOnTestDatabase>;
export type PayoutsModul = PayoutsSetup;

/** The bytes of a bank slip, as a real upload of a transfer proof is. */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/** The transfer proof Admin Platform uploads with a Bukti Pencairan. */
export const buktiTransfer = { body: jpeg, contentType: "image/jpeg" };

/**
 * A Saat Duka order placed at a listed Lokasi Mitra, with Pengaturan Operator
 * entered (a confirmation issues a Tagihan, and a Tagihan needs the header).
 */
export async function pesananSaatDukaSiap(setup: PayoutsModul, options: LokasiOptions & { email?: string } = {}) {
  const fixture = await saatDukaFixture(setup, options);
  const admin = await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, admin, nomor: placed.pemesanan.nomor, cells };
}

/**
 * That order confirmed by its own Admin Lokasi: the Petak is assigned, the Hak
 * Pakai created and the pay-after Tagihan issued. The confirmation answers with
 * the Tagihan's number, so its id is read back the way a page would read it.
 */
export async function konfirmasiPesanan(
  setup: PayoutsModul,
  fixture: Awaited<ReturnType<typeof pesananSaatDukaSiap>>,
  pemakamanAt = "2026-10-02T10:00",
) {
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: fixture.nomor,
    petakId: fixture.cells[0]!.id,
    pemakamanAt,
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  const order = await setup.pemesanan.orderUntukStaf(fixture.admin, fixture.nomor);
  if (!order?.tagihanId) throw new Error("the confirmed order has no Tagihan id");
  return { ...hasil, tagihanId: order.tagihanId, pemakamanPada: wib(pemakamanAt) };
}

/**
 * Pays a Tagihan the way a family does through the real module, which is the
 * only way the Lunas half of the Pencairan trigger fires. `method` is how the
 * money arrived: "dibayar langsung ke Lokasi Mitra" is what AC 2 turns into a
 * platform-fee Potongan instead of a tariff Pencairan.
 */
export async function bayarTagihan(
  setup: PayoutsModul,
  tagihanId: string,
  method: PaymentMethod = { kind: "penyedia_pembayaran", channel: "QRIS" },
) {
  const dibayar = await setup.billing.recordPayment(tagihanId, { method, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  return dibayar;
}

/**
 * Records one order's Pemakaman. Today this helper is the **only** writer of that
 * fact in the whole tree: the Pemakaman module (ticket 25) is the caller in
 * production and is not merged yet, so every trigger test stands in for it.
 */
export async function catatPemakaman(setup: PayoutsModul, nomorPemesanan: string, pemakamanAt: Date) {
  await setup.db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan, pemakamanAt }));
}

/**
 * A Terverifikasi Lokasi Mitra with "Pemesanan Terencana aktif" on and a Denah that holds
 * cleared Tersedia Petak and one whole Kavling Keluarga, plus a Pemesan with an Akun: a
 * placed Pemesanan Terencana, ready for the Lokasi's confirmation (ticket 37).
 *
 * The `pemesananOnTestDatabase` shape (not this file's) is the base, because a
 * Terencairan's confirmation issues a Tagihan and its payment grants a Hak Pakai — the
 * wizard fixture beside it, so this one is the same stack one module over.
 */
export async function pesananTerencanaSiap(
  setup: PayoutsModul,
  options: { nama?: string; email?: string; masaPembatalanDays?: number; petak?: string[]; kavling?: boolean } = {},
) {
  const wizard = pemesananOnTestDatabase(setup.db);
  // Pengaturan Operator first: a Terencairan's confirmation issues a Tagihan, and a
  // Tagihan cannot be issued without the Operator's header. The Lokasi comes after it, so
  // the Admin Platform this asks for is the shared fixture's one and only one.
  const admin = await siapkanOperatorPemesanan(wizard);
  const fixture = await terencanaLokasi(wizard, admin, { ...options, ...(options.nama ? { name: options.nama } : {}) });
  const pemesan = (await pemesanDenganEmail(wizard, options.email ?? "kelarga.terencana@contoh.id")).pemesan;
  const semua = await unitIds(wizard, fixture, [...(options.petak ?? ["A-01", "A-02"]), ...(options.kavling ? ["A-K01"] : [])]);
  return { ...wizard, admin, fixture, pemesan, semua };
}

/**
 * Places a Pemesanan Terencana for the plots `pilihan` names, as the wizard's Kirim
 * does, and returns the placed order as the module's own read gives it back — with the
 * Syarat snapshot it was placed under, which is what the Terencairan Pencairan trigger
 * counts a Masa Pembatalan from.
 */
export async function pesanTerencana(
  setup: Awaited<ReturnType<typeof pesananTerencanaSiap>>,
  pilihan: { petak?: string[]; kavling?: boolean } = {},
) {
  const units = [
    ...(pilihan.petak ?? ["A-01", "A-02"]).map((nomor) => ({ petakId: setup.semua[nomor]! })),
    ...(pilihan.kavling ? [{ kavlingId: setup.semua["A-K01"]! }] : []),
  ];
  const hasil = await setup.pemesanan.placeTerencana({
    pemesan: setup.pemesan,
    pemesanName: "Rina Wulandari",
    phoneNumber: "081234567890",
    lokasiId: setup.fixture.lokasiMitra.id,
    units,
    pemegangHak: { mode: "pemesan" },
    calonPenghuni: { mode: "lain", name: "Neneng Sutrisno" },
  });
  if (!hasil.ok) throw new Error(`placeTerencana refused: ${hasil.reason}`);
  const order = await setup.pemesanan.terencanaOf(hasil.pemesanan.nomor, setup.pemesan);
  if (!order) throw new Error("the placed order cannot be read back");
  return order;
}

/** A Mitra Jasa, invited by Admin Platform and logged in with a Kode Masuk. */export async function mitraJasa(setup: PayoutsModul, admin: Actor, email = "mitra.jasa@contoh.id") {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "085555555555", role: "mitra_jasa" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return { actor, email };
}

/** The Admin Lokasi of one Lokasi Mitra, as its own staff member (never a second seed). */
export async function adminLokasiOf(setup: PayoutsModul, admin: Actor, lokasiId: string, nomor: number) {
  const email = `admin.lokasi.pencairan-${nomor}@contoh.id`;
  const invited = await setup.lokasi.inviteAdminLokasi(admin, lokasiId, { email, phoneNumber: `0833333333${nomor}0` });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}
