import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { buktiOf, createLayanan as createLayananModule, type PekerjaanMitraJasa, type PekerjaanMitraJasaPort, type NewLayanan } from "@/domain/layanan";
import { publishOnTestDatabase, publishedLokasiMitra, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./publish";
import { setLokasiMitraStatusForTest } from "./lokasi";
import { actorOf, logIn } from "./identity";

/**
 * The Layanan module on the test Postgres, next to Tariffs, Lokasi and the publish
 * path (so a test can take a Lokasi Mitra all the way to Terverifikasi and read
 * the prices its public page shows), sharing their fake Clock and Audit Log.
 *
 * The job port is the one seam that is not a real module yet: the rows that say
 * "one job one Mitra Jasa holds" are created by the ticket that creates jobs (50
 * for a Lokasi Mitra, 56 for a TPU), so a test seeds them here as job facts and
 * the module under test still windows, counts and acts on them itself. What a test
 * proves is therefore the Layanan module's rules, not the job store's.
 */
export function layananOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const pekerjaan = newPekerjaanMitraJasaPort();
  const layanan = createLayananModule({
    db,
    clock: setup.clock,
    audit: setup.audit,
    files: setup.files,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    pekerjaan,
  });
  return { ...setup, layanan, pekerjaan };
}

export type LayananSetup = ReturnType<typeof layananOnTestDatabase>;

export { newLokasiMitra, publishedLokasiMitra, setLokasiMitraStatusForTest, signedInAdminLokasi, signedInAdminPlatform };

/**
 * A Layanan of the v1 catalog, typed as an Admin Platform would enter it: the
 * kind (`jenis`) and the proof that kind requires, which is what the form carries.
 */
export function newLayananInput(overrides: Partial<NewLayanan> = {}): NewLayanan {
  const jenis = overrides.jenis ?? "pembersihan";
  return {
    name: "Pembersihan Makam",
    description: "Membersihkan dan merapikan makam.",
    jenis,
    bukti: buktiOf(jenis),
    leadTimeDays: 3,
    bisaHariH: false,
    adaDiPetakKosong: true,
    teksLabel: null,
    varian: ["Reguler"],
    reason: null,
    ...overrides,
  };
}

/** A Layanan in the catalog, created by `admin`, with its first variant's id. */
export async function newLayananFor(setup: LayananSetup, admin: Actor, overrides: Partial<NewLayanan> = {}) {
  const created = await setup.layanan.createLayanan(admin, newLayananInput(overrides));
  if (!created.ok) throw new Error(`Layanan refused: ${created.reason}`);
  return { layanan: created.layanan, varian: created.layanan.varian[0] };
}

/** A Layanan in the catalog, with a signed-in Admin Platform who made it. */
export async function catalogFixture(setup: LayananSetup, overrides: Partial<NewLayanan> = {}) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  return { admin, ...(await newLayananFor(setup, admin, overrides)) };
}

/* The Mitra Jasa (ticket 55) */

/** One job, as the module that owns jobs would hand it over. */
export function newPekerjaan(overrides: Partial<PekerjaanMitraJasa> & { id: string }): PekerjaanMitraJasa {
  return {
    status: "dijadwalkan",
    targetDate: "2026-10-05",
    dihitungPada: null,
    terlambat: false,
    keluhanUpheld: false,
    ditolak: false,
    tidakDirespons: false,
    penilaian: null,
    ...overrides,
  };
}

/**
 * The job port with an in-memory list: what a test seeds, and what a release comes
 * off. `gagalLepas` makes the next release fail, so a test can see that a status
 * change which cannot take a job off leaves the status alone.
 */
export function newPekerjaanMitraJasaPort() {
  const pekerjaan: { mitraJasaId: string; job: PekerjaanMitraJasa }[] = [];
  /** Every release a status change asked for, with the reason it gave. */
  const dilepas: { pekerjaanId: string; alasan: string }[] = [];
  let gagalLepas = false;
  const port: PekerjaanMitraJasaPort & {
    seed: (mitraJasaId: string, jobs: PekerjaanMitraJasa[]) => void;
    dilepas: typeof dilepas;
    gagalLepas: (ya: boolean) => void;
  } = {
    async daftarPekerjaan(mitraJasaId) {
      return pekerjaan.filter((satu) => satu.mitraJasaId === mitraJasaId).map((satu) => satu.job);
    },
    async lepasPekerjaan(input) {
      const satu = pekerjaan.find((satu) => satu.job.id === input.pekerjaanId);
      if (!satu || gagalLepas) return { ok: false, reason: "tidak_ditemukan" };
      dilepas.push(input);
      return { ok: true };
    },
    within() {
      return port;
    },
    seed(mitraJasaId, jobs) {
      pekerjaan.push(...jobs.map((job) => ({ mitraJasaId, job })));
    },
    dilepas,
    gagalLepas: (ya) => {
      gagalLepas = ya;
    },
  };
  return port;
}

/** How many Layanan the fixtures have made, so each is named after its own. */
let layananBerikut = 0;

/** A NIK for a fixture, 16 digits and different on every call: the NIK is unique in the database. */
let nikBerikut = 1;
export function nikFixture(): string {
  nikBerikut += 1;
  return `320101450390${String(nikBerikut).padStart(4, "0")}`;
}

/** A Mitra Jasa's profile, typed as Admin Platform's onboarding form types it. */
export function newMitraJasaInput(overrides: Record<string, unknown> = {}) {
  return {
    namaLengkap: "Siti Rahayu",
    nik: nikFixture(),
    area: "Jakarta Timur",
    kontakSiagaNama: null,
    kontakSiagaTelepon: null,
    ...overrides,
  };
}

/** The account holder that matches the profile's KTP name, so the bank rule passes without an override. */
export function rekeningSesuaiKtp(namaLengkap: string, overrides: Record<string, unknown> = {}) {
  return { bankName: "BSI", accountNumber: "7123456789", accountHolder: namaLengkap, catatanOverride: null, ...overrides };
}

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const pdf = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

/**
 * A Mitra Jasa onboarded all the way to complete, through the module's own writes
 * and its own files: the profile, the three files, the bank account in the KTP
 * name, the coverage lists, and a signed-in Akun holding the role (the Undangan
 * Staf the profile's email is addressed to).
 */
export async function mitraJasaLengkap(
  setup: LayananSetup,
  admin: Actor,
  options: { email?: string; tpuDkiId?: string; layananVariantId?: string; namaLengkap?: string } = {},
) {
  const email = options.email ?? "mitra.jasa@contoh.id";
  const namaLengkap = options.namaLengkap ?? "Siti Rahayu";
  const dibuat = await setup.layanan.buatMitraJasa(admin, email, newMitraJasaInput({ namaLengkap }));
  if (!dibuat.ok) throw new Error(`Mitra Jasa refused: ${dibuat.reason}`);
  const id = dibuat.mitraJasaId;
  for (const jenis of ["ktp", "foto"] as const) {
    const uploaded = await setup.layanan.unggahBerkas(admin, id, { jenis, file: { body: jpeg(), contentType: "image/jpeg" } });
    if (!uploaded.ok) throw new Error(`berkas ${jenis} refused: ${uploaded.reason}`);
  }
  const perjanjian = await setup.layanan.unggahBerkas(admin, id, {
    jenis: "perjanjian",
    file: { body: pdf(), contentType: "application/pdf" },
    signedOn: "2026-09-20",
  });
  if (!perjanjian.ok) throw new Error(`perjanjian refused: ${perjanjian.reason}`);
  const rekening = await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp(namaLengkap));
  if (!rekening.ok) throw new Error(`rekening refused: ${rekening.reason}`);
  // A Layanan of its own, named so a test that already has one in the catalog does not collide.
  layananBerikut += 1;
  const variant = options.layananVariantId ?? (await newLayananFor(setup, admin, { name: `Layanan ${layananBerikut}` })).varian.id;
  const coverage = await setup.layanan.ubahCoverage(admin, id, {
    tpuDkiIds: options.tpuDkiId ? [options.tpuDkiId] : [],
    layananVariantIds: [variant],
  });
  if (!coverage.ok) throw new Error(`coverage refused: ${coverage.reason}`);
  return { id, email, namaLengkap, layananVariantId: variant };
}

/** A Mitra Jasa signed in on its own Akun, having accepted the Undangan Staf. */
export async function signedInMitraJasa(setup: LayananSetup, admin: Actor, email = "mitra.jasa@contoh.id") {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "085555555555", role: "mitra_jasa" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const actor = await actorOf(setup.identity, (await logIn(setup, email)).cookies);
  return actor;
}

/** A job `hari` days before `now` (the fake Clock), finished, with the given flags. */
export function pekerjaanSelesai(hari: number, now: Date, overrides: Partial<PekerjaanMitraJasa> = {}): PekerjaanMitraJasa {
  const dihitungPada = new Date(now.getTime() - hari * 86_400_000);
  return newPekerjaan({
    id: `job-${hari}-${overrides.penilaian ?? 0}`,
    status: "selesai",
    targetDate: wibTanggal(dihitungPada),
    dihitungPada,
    ...overrides,
  });
}

function wibTanggal(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}
