import type { Database } from "@/db/client";
import { createPengurusan } from "@/domain/pengurusan";
import type { PengurusanDikonfirmasiInput } from "@/domain/notifications";
import { adminPlatformOf } from "./identity";
import { publishOnTestDatabase } from "./publish";
import { pemesanDenganEmail } from "./pemesanan";

/**
 * The Pengurusan module on the test Postgres: Lokasi (which owns the TPU list
 * and the working-time calculator), Tariffs, Billing and Identity composed around
 * it, sharing one fake Clock, FileStore, EmailSender and Audit Log. No Lokasi
 * Mitra and no plot: a TPU order needs none of them.
 */
export function pengurusanOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  /** Every Saat Duka TPU confirmation the module announced, for a test that reads the family message. */
  const diumumkan: PengurusanDikonfirmasiInput[] = [];
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
    notifikasi: {
      tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
      pengurusanDikonfirmasi: async (hasil) => {
        diumumkan.push(hasil);
        return { ok: true };
      },
    },
  });
  return { ...setup, pengurusan, pengurusanDikonfirmasi: diumumkan };
}

export type PengurusanSetup = ReturnType<typeof pengurusanOnTestDatabase>;

/** The one Admin Platform a setup's fixtures act as (the first seed is refused twice). */
function adminPlatform(setup: PengurusanSetup) {
  return adminPlatformOf(setup);
}

/**
 * The three global tariffs a Saat Duka TPU order is made of, in force from
 * 1 October 2026, with odd amounts so a wrong sum cannot hide behind round
 * numbers. The Biaya Layanan Platform is entered too: a TPU order must never
 * carry it, and a test can only prove that if one exists.
 */
export async function hargaTpu(setup: PengurusanSetup) {
  const { actor: admin } = await adminPlatform(setup);
  const masuk = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await masuk("biaya_pengurusan_pemakaman", 1_750_000);
  await masuk("biaya_pengurusan_berkas", 750_000);
  await masuk("retribusi_pemda_iptm", 0);
  await masuk("biaya_layanan_platform", 150_001);
  return admin;
}

export interface TpuOptions {
  /** Defaults to "TPU Kober"; the TPU takes new plots unless `menerimaMakamBaru` says otherwise. */
  name?: string;
  menerimaMakamBaru?: boolean;
  city?: string;
}

/** A DKI TPU on the list, with the new-plot flag as found and the city its card is filtered by. */
export async function tpu(setup: PengurusanSetup, options: TpuOptions = {}) {
  const { actor: admin } = await adminPlatform(setup);
  const created = await setup.lokasi.createTpuDki(admin, {
    name: options.name ?? "TPU Kober",
    address: `Jl. ${options.name ?? "TPU Kober"} No. 1, Jakarta Timur`,
    city: options.city ?? "Kota Jakarta Timur",
    pin: { lat: -6.2, lng: 106.9 },
    dataSource: "Dinas Pengguna Umum dan Prasarana",
    menerimaMakamBaru: options.menerimaMakamBaru ?? true,
  });
  if (!created.ok) throw new Error(`TPU refused: ${created.reason}`);
  return created.tpuDki;
}

/** Admin Platform records what a TPU takes today, the way the dashboard does. */
export async function setMenerimaMakamBaru(setup: PengurusanSetup, tpuId: string, menerimaMakamBaru: boolean) {
  const { actor: admin } = await adminPlatform(setup);
  const changed = await setup.lokasi.updateTpuDkiFlag(admin, tpuId, { menerimaMakamBaru });
  if (!changed.ok) throw new Error(`flag refused: ${changed.reason}`);
}

/** The IPTM photo a Tumpang carries, as a phone photo of the permit really is. */
export function fotoIptm() {
  return { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };
}

/** The grave a Tumpang is made in, as the form collects it. */
export function kuburanTumpang() {
  return { blokNomor: "Blok B-12 No. 34", nama: "Hasan Basri" };
}

/** A family after a death, at the TPU the list offered: eligible, a new plot, itself the Pemegang Hak. */
export async function saatDukaTpuFixture(setup: PengurusanSetup, options: TpuOptions & { email?: string } = {}) {
  await hargaTpu(setup);
  const tpuDki = await tpu(setup, options);
  const pemesan = await pemesanDenganEmail(setup, options.email ?? "pemesan@contoh.id");
  return { tpuDki, pemesan: pemesan.pemesan };
}

/** What the TPU form sends: a family after a death, at the TPU the list offered. */
export function orderSaatDukaTpu(
  fixture: Awaited<ReturnType<typeof saatDukaTpuFixture>>,
  over: Partial<Parameters<ReturnType<typeof pengurusanOnTestDatabase>["pengurusan"]["placeSaatDukaTpu"]>[0]> = {},
) {
  return {
    pemesan: fixture.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    tpuId: fixture.tpuDki.id,
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-30",
    jenis: "baru" as const,
    kelayakan: { ktpDki: true, wafatDiJakarta: true },
    pemegangHak: { mode: "pemesan" as const },
    ...over,
  };
}

export { pemesanDenganEmail } from "./pemesanan";
export { newTpuDki, signedInAdminPlatform } from "./publish";