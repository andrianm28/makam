import { composePemesanan } from "@/composition/pemesanan";
import type { Database } from "@/db/client";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import type { Notifications } from "@/domain/notifications";
import { createPengurusan } from "@/domain/pengurusan";
import { createPerpanjangan, efekPerpanjangan } from "@/domain/perpanjangan";
import { cellsOf } from "./inventory";
import { payoutsFor } from "./payouts";
import { pemesanDenganEmail, siapkanOperatorPemesanan, terverifikasiLokasi, type PemesananModul } from "./pemesanan";
import { publishOnTestDatabase, type PublishSetup } from "./publish";

/**
 * Lokasi, Tariffs, Inventory, Billing, Notifications, Pemesanan, Payouts and
 * Perpanjangan together on the test Postgres, sharing one fake Clock, FileStore,
 * Identity and Audit Log. Billing runs the two payment effects a Perpanjangan
 * depends on exactly as the runtime registers them: the Perpanjangan module's own
 * (the Hak Pakai extended and its Bukti issued in the payment's transaction) and
 * the Payouts record of a settled payment.
 */
export function perpanjanganOnTestDatabase(db: Database) {
  const ref: { setup?: PublishSetup } = {};
  /**
   * Makes the announcement fail right after it was queued, so a test can see that a rolled-back
   * write leaves no queued message: the module must queue it in the transaction of the write.
   */
  const gagalSetelahAntre = { tagihanTerbit: false, buktiPerpanjangan: false };
  const notifikasi: Pick<Notifications, "tagihanTerbit" | "buktiPerpanjanganTerbit"> = {
    tagihanTerbit: async (input, within) => {
      const hasil = await ref.setup!.notifications.tagihanTerbit(input, within);
      if (gagalSetelahAntre.tagihanTerbit) throw new Error("the announcement failed after it was queued");
      return hasil;
    },
    buktiPerpanjanganTerbit: async (input, within) => {
      const hasil = await ref.setup!.notifications.buktiPerpanjanganTerbit(input, within);
      if (gagalSetelahAntre.buktiPerpanjangan) throw new Error("the announcement failed after it was queued");
      return hasil;
    },
  };
  const efek = efekPerpanjangan({
    billingOn: (tx) => ref.setup!.billing.within(tx),
    inventory: { within: (tx) => ref.setup!.inventory.within(tx) },
    lokasi: { aturanPerpanjanganOf: (lokasiId) => ref.setup!.lokasi.aturanPerpanjanganOf(lokasiId) },
    notifikasi,
  });
  const paymentEffects = [efekPencairanSaatLunas(), efek];
  const setup = publishOnTestDatabase(db, { paymentEffects });
  ref.setup = setup;
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
  const pengurusan = createPengurusan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    billing: setup.billing,
    identity: setup.identity,
    fieldwork: setup.fieldwork,
    notifikasi: setup.notifications,
  });
  const { payouts, dikirim } = payoutsFor(setup);
  const perpanjangan = createPerpanjangan({
    db,
    clock: setup.clock,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    pemesanan,
    identity: setup.identity,
    notifikasi,
  });
  return { ...setup, pemesanan, pengurusan, payouts, dikirim, perpanjangan, gagalSetelahAntre, paymentEffects };
}

export type PerpanjanganSetup = ReturnType<typeof perpanjanganOnTestDatabase>;

/** The holder of an example Hak Pakai. */
export const PEMEGANG_HAK = { name: "Hj. Rahmawati", phoneNumber: "081298765432", email: "pemegang@contoh.id" };

/**
 * A listed Lokasi Mitra (Jenis Makam of 5 years, Perpanjangan price Rp 3.000.000
 * per term, Biaya Layanan Platform Rp 150.000, fake Clock at 2026-10-01 09:00 WIB)
 * with Pengaturan Operator entered and one existing grave: a Hak Pakai of the
 * Pemegang Hak `pemegang`, first buried on `pemakamanOn`, so it ends five years
 * later. Records go in through the Admin Lokasi's own clearing of the Petak, as
 * existing graves get onto the platform before any import.
 */
export async function hakPakaiSiap(
  setup: PerpanjanganSetup,
  options: { pemakamanOn?: string; pemegang?: { name: string; phoneNumber: string; email?: string }; dataMenyusul?: boolean; cell?: number } = {},
) {
  const lokasi = await terverifikasiLokasi(setup as PemesananModul);
  await siapkanOperatorPemesanan(setup as PemesananModul);
  const [blok] = await setup.inventory.asStaff(lokasi.adminLokasi).bloks(lokasi.lokasiMitra.id);
  const cells = (await cellsOf(setup, lokasi.adminLokasi, lokasi.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const cell = cells[options.cell ?? 0]!;
  const cleared = await setup.inventory.clearPetak(
    lokasi.adminLokasi,
    lokasi.lokasiMitra.id,
    cell.id,
    options.dataMenyusul
      ? { mode: "terisi", dataMenyusul: true }
      : {
          mode: "terisi",
          dataMenyusul: false,
          pemegangHak: options.pemegang ?? PEMEGANG_HAK,
          pemakaman: { almarhumName: "Almarhum Contoh", date: options.pemakamanOn ?? "2021-10-15" },
        },
  );
  if (!cleared.ok || !cleared.hakPakaiId) throw new Error(`clearPetak refused: ${cleared.ok ? "no Hak Pakai" : cleared.reason}`);
  return { ...lokasi, hakPakaiId: cleared.hakPakaiId, nomorMakam: cell.nomorMakam! };
}

/** An Akun (created by its own Kode Masuk when it has none) as a wizard hands it to a module. */
export async function akunDenganEmail(setup: PerpanjanganSetup, email: string) {
  const { pemesan } = await pemesanDenganEmail(setup as PemesananModul, email);
  return pemesan;
}
