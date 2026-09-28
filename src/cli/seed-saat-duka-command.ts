/**
 * `npx tsx src/cli/seed-saat-duka.ts` (dev) or, in a local stack's image,
 * `node dist/seed-saat-duka.mjs`: gives a development or test stack one
 * Terverifikasi Lokasi Mitra the Saat Duka wizard can offer — a priced Jenis
 * Makam with cleared Tersedia Petak, a Jam Operasional and a Kontak Siaga — so
 * the wizard can be walked (and end-to-end tested) before real Lokasi Mitra
 * data exists. It changes nothing once the stack has a listed Lokasi Mitra.
 * Refused on staging and production. Exit 0 seeded or already there, 1 refused
 * or failed, 2 usage.
 */
import { z } from "zod";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import { createFieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import { createInventory } from "@/domain/inventory";
import { createLokasi } from "@/domain/lokasi";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createTariffs } from "@/domain/tariffs";
import { appEnvironments, readRuntimeEnv, usesInMemoryFakes } from "@/lib/env";
import { wibDateOf } from "@/lib/time/jakarta";
import { cliFailure } from "./cli-failure";
import { adminPlatform, masukSebagai, scanPerjanjian, type Gagal, type Modul } from "./dev-seed-support";

const USAGE = "Pakai: seed-saat-duka";

const CONTOH_LOKASI = {
  name: "Makam Wakaf Al-Ikhlas",
  pengelolaName: "Yayasan Al-Ikhlas",
  address: "Jl. Raya Pondok Rangon No. 1",
  city: "Kota Jakarta Timur",
};
const ADMIN_LOKASI = { email: "lokasi.saat-duka@contoh.id", phoneNumber: "083333333333" };
const PETUGAS = { email: "petugas.saat-duka@contoh.id", phoneNumber: "084444444444" };

/** Jam Operasional 07:00–15:00 WIB, Monday–Saturday, as the fixture's Admin Lokasi would type it. */
const jamBuka = { opens: "07:00", closes: "15:00" };
const jamOperasional = {
  weekly: {
    monday: jamBuka,
    tuesday: jamBuka,
    wednesday: jamBuka,
    thursday: jamBuka,
    friday: jamBuka,
    saturday: jamBuka,
    sunday: null,
  },
  tanggalTutup: [],
};
const fotoLokasi = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

export async function seedSaatDukaCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  if (argv.length > 0) return { exitCode: 2, output: USAGE };
  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success || !usesInMemoryFakes(appEnv.data)) {
    return { exitCode: 1, output: "Ditolak: seed-saat-duka hanya untuk development dan test." };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "makam-seed-saat-duka" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, vapid: env.vapid, devFilesRoot: env.DEV_FILES_ROOT });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
      const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
      const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
      const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError: () => {} });
      const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing, reportError: () => {} });
      const modul: Modul = {
        db: database.db,
        adapters,
        identity,
        lokasi,
        tariffs,
        inventory: createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi }),
        fieldwork: createFieldwork({
          db: database.db,
          clock: adapters.clock,
          files: adapters.files,
          audit,
          identity,
          notifications,
          lokasi,
          // Billing is composed above, so the Setor Retribusi read is the real one.
          billing,
        }),
      };

      const admin = await adminPlatform(identity);
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };

      const terdaftar = await lokasi.publicLokasiMitraList();
      if (terdaftar.length > 0) {
        return { exitCode: 0, output: `Sudah ada ${terdaftar.length} Lokasi Mitra di listing; seed-saat-duka tidak mengubah apa pun. Lokasi Mitra: /lokasi/${terdaftar[0].id}` };
      }
      return await seedLokasiMitra(modul, admin);
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

/** One Lokasi Mitra taken all the way to Terverifikasi, with four cleared Tersedia Petak to choose from. */
async function seedLokasiMitra(modul: Modul, admin: Actor): Promise<{ exitCode: number; output: string }> {
  const { lokasi, inventory } = modul;
  const dibuat = await lokasi.createLokasiMitra(admin, CONTOH_LOKASI);
  if (!dibuat.ok) return { exitCode: 1, output: `Ditolak: Lokasi Mitra contoh tidak dibuat (${dibuat.reason}).` };
  const lokasiId = dibuat.lokasiMitra.id;

  const adminLokasi = await masukSebagai(modul, ADMIN_LOKASI.email, () => lokasi.inviteAdminLokasi(admin, lokasiId, ADMIN_LOKASI));
  if (!adminLokasi.ok) return { exitCode: 1, output: `Ditolak: Admin Lokasi contoh tidak siap (${adminLokasi.reason}).` };
  const petugas = await masukSebagai(modul, PETUGAS.email, () => modul.identity.inviteStaff(admin, { ...PETUGAS, role: "petugas_lapangan" }));
  if (!petugas.ok) return { exitCode: 1, output: `Ditolak: Petugas Lapangan contoh tidak siap (${petugas.reason}).` };

  const terbit = await terbitkan(modul, admin, lokasiId, adminLokasi.value, petugas.value);
  if (!terbit.ok) return { exitCode: 1, output: `Ditolak: Lokasi Mitra contoh tidak terbit (${terbit.reason}).` };

  const blok = await inventory.createBlok(adminLokasi.value, lokasiId, { name: "A", rows: 2, cols: 2, jenisMakamId: terbit.value });
  if (!blok.ok) return { exitCode: 1, output: `Ditolak: Denah contoh tidak dibuat (${blok.reason}).` };
  const denah = await inventory.asStaff(adminLokasi.value).blok(lokasiId, blok.blok.id);
  for (const cell of denah?.cells ?? []) {
    const cleared = await inventory.clearPetak(adminLokasi.value, lokasiId, cell.id, { mode: "tersedia" });
    if (!cleared.ok) return { exitCode: 1, output: `Ditolak: Petak contoh tidak ditandai Tersedia (${cleared.reason}).` };
  }
  return {
    exitCode: 0,
    output: `Lokasi Mitra contoh ${CONTOH_LOKASI.name} terbit (Terverifikasi) dengan 4 Petak Tersedia. Lokasi Mitra: /lokasi/${lokasiId}`,
  };
}

/** The agreement, the Jam Operasional, the Kontak Siaga, the Kunjungan Verifikasi and the tariffs the listing gate needs. */
async function terbitkan(modul: Modul, admin: Actor, lokasiId: string, adminLokasi: Actor, petugas: Actor): Promise<{ ok: true; value: string } | Gagal> {
  const { lokasi, tariffs, fieldwork, adapters } = modul;
  const hariIni = wibDateOf(adapters.clock.now());

  const agreement = await lokasi.uploadAgreement(admin, lokasiId, {
    scan: { body: scanPerjanjian, contentType: "application/pdf" },
    signedOn: hariIni,
  });
  if (!agreement.ok) return { ok: false, reason: agreement.reason };
  const jam = await lokasi.setJamOperasional(admin, lokasiId, jamOperasional);
  if (!jam.ok) return { ok: false, reason: jam.reason };
  const kontak = await lokasi.pickKontakSiaga(admin, lokasiId, { accountId: adminLokasi.accountId });
  if (!kontak.ok) return { ok: false, reason: kontak.reason };

  const tugas = await fieldwork.createTugasLapangan(admin, {
    type: "kunjungan_verifikasi",
    subject: "Kunjungan Verifikasi",
    lokasiId,
    address: CONTOH_LOKASI.address,
    pin: { lat: -6.29, lng: 106.9 },
    plannedDate: hariIni,
    assigneeAccountId: petugas.accountId,
  });
  if (!tugas.ok) return { ok: false, reason: tugas.reason };
  const selesai = await fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
    form: { addressConfirmed: true, pin: { lat: -6.301, lng: 106.901 }, facilities: { checked: ["parkir"], note: "" }, note: "Sesuai" },
    uploads: [{ kind: "foto_lokasi", file: { body: fotoLokasi, contentType: "image/jpeg" } }],
  });
  if (!selesai.ok) return { ok: false, reason: selesai.reason };

  const jenis = await tariffs.createJenisMakam(admin, lokasiId, {
    name: "Reguler 1 × 2 m",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: hariIni },
    reason: null,
  });
  if (!jenis.ok) return { ok: false, reason: jenis.reason };
  const pemakaman = await tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: hariIni,
    reason: null,
  });
  if (!pemakaman.ok) return { ok: false, reason: pemakaman.reason };
  const platform = await tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: hariIni, reason: null });
  if (!platform.ok) return { ok: false, reason: platform.reason };
  const checked = await tariffs.markTariffsChecked(admin, lokasiId, { reason: null });
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const fakta = await tariffs.asStaff(admin).tariffsChecked(lokasiId);
  const published = await lokasi.publish(admin, lokasiId, { tariffsChecked: fakta && { changedSinceCheck: fakta.changedSinceCheck } });
  if (!published.ok) return { ok: false, reason: JSON.stringify(published) };
  return { ok: true, value: jenis.jenisMakam.id };
}
