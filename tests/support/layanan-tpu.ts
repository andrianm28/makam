import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { adminPlatformOf } from "./identity";
import { layananOnTestDatabase, mitraJasaLengkap, newLayananFor, signedInMitraJasa, siapkanOperatorLayanan, type LayananSetup } from "./layanan";
import { pemesanDenganEmail } from "./pemesanan";
import { newTpuDki } from "./lokasi";
import { signedInPetugasLapangan } from "./publish";

/*
 * The Layanan module's TPU half is `layananOnTestDatabase(db, { pekerjaanNyata: true })`: the module with its
 * **real** Mitra Jasa job port (so the scorecard, the picker's "Baru" badge and a suspension's release read the
 * real jobs), beside Pengurusan and Billing with the Layanan payment effect. These are the fixtures around it.
 */

/** The DKI prices the fixtures use, odd enough that a wrong sum cannot hide behind round numbers. */
export const HARGA_BUNGA_TABUR = 250_001;
export const HARGA_PEMBERSIHAN = 400_003;

/**
 * A DKI TPU that takes new plots, the Operator's Pengurusan tariffs, and two
 * Layanan marked "boleh di TPU DKI" at DKI prices: **Bunga Tabur**, bisa hari-H with a
 * one-day lead time, and **Pembersihan Makam**, which is not hari-H (a standalone
 * order with a three-day lead time). A Biaya Layanan Platform is entered too: a TPU
 * order must never carry it, and a test can only prove that if one exists.
 */
export async function siapTpu(setup: LayananSetup) {
  const admin = await siapkanOperatorLayanan(setup);
  for (const [key, amount] of [
    ["biaya_pengurusan_pemakaman", 1_750_000],
    ["biaya_pengurusan_berkas", 750_000],
    ["retribusi_pemda_iptm", 0],
    ["biaya_layanan_platform", 150_001],
  ] as const) {
    const masuk = await setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
    if (!masuk.ok) throw new Error(`tariff ${key} refused: ${masuk.reason}`);
  }
  const tpu = await newTpuDki(setup, admin);

  const bunga = await newLayananFor(setup, admin, {
    name: "Bunga Tabur",
    jenis: "bunga",
    bukti: "foto_sesudah",
    leadTimeDays: 1,
    bisaHariH: true,
    adaDiPetakKosong: false,
    varian: ["Reguler"],
  });
  const pembersihan = await newLayananFor(setup, admin, {
    name: "Pembersihan Makam",
    jenis: "pembersihan",
    bukti: "foto_sebelum_dan_sesudah",
    leadTimeDays: 3,
    bisaHariH: false,
    varian: ["Reguler"],
  });
  for (const [varian, amount] of [
    [bunga.varian, HARGA_BUNGA_TABUR],
    [pembersihan.varian, HARGA_PEMBERSIHAN],
  ] as const) {
    const tanda = await setup.layanan.tandaiBolehDiTpu(admin, varian.id, { boleh: true, reason: null });
    if (!tanda.ok) throw new Error(`tandai refused: ${tanda.reason}`);
    const harga = await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount, effectiveOn: "2026-10-01", reason: null });
    if (!harga.ok) throw new Error(`harga DKI refused: ${harga.reason}`);
  }
  const { pemesan } = await pemesanDenganEmail(setup, "pemesan.tpu@contoh.id");
  return { admin, tpu, bunga: bunga.varian, pembersihan: pembersihan.varian, pemesan };
}

export type SiapTpu = Awaited<ReturnType<typeof siapTpu>>;

/** A Mitra Jasa onboarded to cover this TPU and this Layanan variant, with their own signed-in Akun. */
export async function mitraJasaUntuk(
  setup: LayananSetup,
  siap: Pick<SiapTpu, "admin" | "tpu">,
  varianId: string,
  options: { email?: string; namaLengkap?: string } = {},
) {
  const email = options.email ?? "mitra.jasa@contoh.id";
  const mitra = await mitraJasaLengkap(setup, siap.admin, {
    email,
    tpuDkiId: siap.tpu.id,
    layananVariantId: varianId,
    ...(options.namaLengkap === undefined ? {} : { namaLengkap: options.namaLengkap }),
  });
  const actor = await signedInMitraJasa(setup, siap.admin, email);
  return { ...mitra, actor };
}

/** The Mitra Jasa rate of a Bunga Tabur and of a Pembersihan Makam in the tests that pay a Mitra Jasa (`siapTpuBertarif`). */
export const TARIF = 150_000;
/** The bytes of a JPEG, as a Mitra Jasa's shot of the proof. */
export const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/** `siapTpu` on the real Mitra Jasa job port, with the Mitra Jasa rate of both Layanan entered: where a test of a job's proof and pay starts. */
export async function siapTpuBertarif(db: Database) {
  const setup = layananOnTestDatabase(db, { pekerjaanNyata: true });
  const tpuSiap = await siapTpu(setup);
  for (const varian of [tpuSiap.bunga, tpuSiap.pembersihan]) {
    const tarif = await setup.tariffs.setTarifMitraJasa(tpuSiap.admin, varian.id, { amount: TARIF, effectiveOn: "2026-10-01", reason: null });
    if (!tarif.ok) throw new Error(`tarif refused: ${tarif.reason}`);
  }
  return { setup, ...tpuSiap };
}
export type SiapTpuBertarif = Awaited<ReturnType<typeof siapTpuBertarif>>;
export type MitraJasaTpu = Awaited<ReturnType<typeof mitraJasaUntuk>>;

/** Admin Platform hands the job to `mitra`, who accepts. */
export async function diterima(s: SiapTpuBertarif, mitra: MitraJasaTpu, pekerjaanId: string) {
  const tugas = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId, mitraJasaId: mitra.id });
  if (!tugas.ok) throw new Error(`assign refused: ${tugas.reason}`);
  const jawab = await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId, jawaban: "terima" });
  if (!jawab.ok) throw new Error(`accept refused: ${jawab.reason}`);
}

/** Admin Platform approves the job's proof; answers what the approval answered. */
export async function setujui(s: SiapTpuBertarif, pekerjaanId: string) {
  const hasil = await s.setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId });
  if (!hasil.ok) throw new Error(`approve refused: ${hasil.reason}`);
  return hasil;
}

/** The TPU jobs the Mitra Jasa sees in their Pencairan. */
export async function pencairanSaya(s: SiapTpuBertarif, mitra: MitraJasaTpu) {
  const hasil = await s.setup.payouts.pencairanMitraJasa(mitra.actor);
  if (!hasil.ok) throw new Error(hasil.reason);
  return hasil.pekerjaan;
}

/** The Mitra Jasa's Pencairan as their page lists it, newest first: a transfer made as one entry, every other Pencairan as its own. */
export async function daftarPencairanSaya(s: SiapTpuBertarif, mitra: MitraJasaTpu) {
  const hasil = await s.setup.payouts.daftarPencairanMitraJasa(mitra.actor);
  if (!hasil.ok) throw new Error(hasil.reason);
  return hasil.pencairan;
}

/** The Mitra Jasa takes every shot the catalog requires for the job and sends the proof. */
export async function kirimBukti(s: SiapTpuBertarif, mitra: MitraJasaTpu, pekerjaanId: string) {
  const perlu = (await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))?.dibutuhkan ?? [];
  for (const kind of perlu) {
    const diambil = await s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind, takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
    if (!diambil.ok) throw new Error(`shot refused: ${diambil.reason}`);
  }
  const kirim = await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
  if (!kirim.ok) throw new Error(`send refused: ${kirim.reason}`);
}

/**
 * A paid TPU order for one Layanan, handed to `mitra`, who accepts and sends the proof, which Admin Platform approves:
 * the Mitra Jasa's Pencairan exists from here on, Belum jatuh tempo until the Keluhan window has closed. The order is
 * placed at `dipesanPada` (default: the fake Clock's usual start, a Thursday at 09:00 WIB, well before its target date) and
 * the proof is sent and approved at `disetujuiPada` (default: straight away), as a Mitra Jasa does the work on the day.
 */
export async function pekerjaanDisetujui(
  s: SiapTpuBertarif,
  mitra: MitraJasaTpu,
  opsi: { varianId?: string; targetDate?: string; dipesanPada?: string; disetujuiPada?: string } = {},
) {
  s.setup.clock.set(wib(opsi.dipesanPada ?? "2026-10-01 09:00"));
  const dipesan = await s.setup.layanan.placePesananLayananTpu(
    s.pemesan,
    orderTpu(s, [{ layananVariantId: opsi.varianId ?? s.bunga.id, targetDate: opsi.targetDate ?? "2026-10-05" }]),
  );
  if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
  const dibayar = await s.setup.billing.recordPayment(dipesan.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: s.setup.clock.now() });
  if (!dibayar.ok) throw new Error("payment refused");
  const job = (await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).find((satu) => satu.nomor === dipesan.pesanan.nomor);
  if (!job) throw new Error("the order has no job");
  await diterima(s, mitra, job.id);
  if (opsi.disetujuiPada) s.setup.clock.set(wib(opsi.disetujuiPada));
  await kirimBukti(s, mitra, job.id);
  await setujui(s, job.id);
  return { pekerjaanId: job.id, nomor: dipesan.pesanan.nomor, tagihanId: dipesan.tagihan.id };
}

/** What the TPU order form sends: a described grave with no Makam TPU, one Layanan on it. */
export function orderTpu(
  siap: Pick<SiapTpu, "tpu">,
  item: { layananVariantId: string; targetDate: string; teks?: string | null }[],
  over: Record<string, unknown> = {},
) {
  return {
    tpuDkiId: siap.tpu.id,
    makam: { blokNomor: "Blok C-7 No. 21", almarhumName: "Hasan Basri", keterangan: "Dekat pohon kamboja", pin: { lat: -6.2001, lng: 106.9001 } },
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    item: item.map((satu) => ({ teks: null, ...satu })),
    ...over,
  };
}

/** The confirm form as Admin Platform fills it in: a burial inside the TPU window, a TPU contact and a Petugas. */
export function konfirmasiTpu(petugasAccountId: string, over: { nomor?: string; pemakamanAt?: string } = {}) {
  return {
    nomor: over.nomor ?? "MKM-2026-000001",
    pemakamanAt: over.pemakamanAt ?? "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId,
    catatan: "",
  };
}

/** Places a Saat Duka TPU order with hari-H items and confirms it, returning what the job tests need. */
export async function saatDukaTpuDikonfirmasi(
  setup: LayananSetup,
  siap: SiapTpu,
  hariH: { layananVariantId: string; teks?: string | null }[],
) {
  const petugas = await signedInPetugasLapangan(setup, siap.admin, "petugas.pengantar@contoh.id");
  const dipesan = await setup.pengurusan.placeSaatDukaTpu({
    pemesan: siap.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    tpuId: siap.tpu.id,
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-30",
    jenis: "baru",
    kelayakan: { ktpDki: true, wafatDiJakarta: true },
    pemegangHak: { mode: "pemesan" },
    layananHariH: hariH.map((satu) => ({ teks: null, ...satu })),
  });
  if (!dipesan.ok) throw new Error(`Saat Duka TPU refused: ${dipesan.reason}`);
  const nomor = dipesan.pengurusan.nomor;
  const hasil = await setup.pengurusan.konfirmasiSaatDukaTpu(siap.admin, konfirmasiTpu(petugas.accountId, { nomor }));
  if (!hasil.ok) throw new Error(`konfirmasi refused: ${hasil.reason}`);
  return { nomor, hasil, petugas };
}

/** A staff actor for a role, used where a test needs "somebody else". */
export async function adminPlatformTpu(setup: LayananSetup): Promise<Actor> {
  return (await adminPlatformOf(setup)).actor;
}
