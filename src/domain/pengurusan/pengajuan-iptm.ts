/**
 * The filing of a Saat Duka TPU order, from the recorded burial to the IPTM in the
 * family's hands (spec, Pengurusan: statuses, documents, Surat Kuasa, Makam TPU,
 * cancellation, IPTM handover; stories 74-77 and 147; ticket 46).
 *
 * The steps, each one Admin Platform's (the documents are the Pemesan's):
 * Dikonfirmasi -> Dimakamkan (burial recorded: starts the pay-after clock and the
 * 7-day window for the filing documents) -> Dokumen Lengkap (every filing document,
 * the signed Surat Kuasa among them, is in) -> IPTM Diajukan (filed on JakEVO; from
 * a Tier 3 row due 7 days after Dokumen Lengkap) -> IPTM Terbit (the scan and its
 * expiry are uploaded; the Makam TPU record is created or updated).
 *
 * The IPTM is handed over **whatever the Tagihan's status**: nothing here reads it.
 *
 * Cancelling is the Pemesan's, before the IPTM is filed. An unpaid Tagihan is
 * voided; a paid one becomes a refund request (Refunds approves and transfers):
 * everything before Dimakamkan, everything but the Biaya Pengurusan from then on,
 * because by then the Operator has arranged the burial with the TPU.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { refusable } from "@/db/unit-of-work";
import { nilaiDibayarBaris } from "@/domain/billing";
import { pengurusanTpuResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { wibDateOf } from "@/lib/time/jakarta";
import type { PengurusanDeps } from "./deps";
import { hariKemudian, menerimaUnggahan, menungguPemeriksaan, STATUS_BOLEH_DIBATALKAN, STATUS_MENERIMA_UNGGAHAN, STATUS_SUDAH_DIMAKAMKAN } from "./aturan";
import { periksaDokumenBerkas, type TagihanBerkas } from "./pengurusan-berkas";
import { blokMakamOf } from "./reads";
import { makamTpu, pengurusanTpu, type DokumenDiunggah } from "./schema";

/** The filing documents are due this many days after the burial is recorded. */
export const HARI_BERKAS_PENGAJUAN = 7;
/** A filing document or IPTM scan: a phone photo or a PDF of a few pages. */
export const BERKAS_MAX_BYTES = 8 * 1024 * 1024;
const JENIS_BERKAS = ["image/jpeg", "image/png", "application/pdf"] as const;
/** PT Jaya Korpora Prima, the Operator: who the Surat Kuasa gives the authority to (spec, Surat Kuasa generator). */
export const NAMA_OPERATOR_SURAT_KUASA = "PT Jaya Korpora Prima";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);
const berkasSchema = z.object({
  body: z.instanceof(Uint8Array).refine((body) => body.byteLength > 0 && body.byteLength <= BERKAS_MAX_BYTES),
  contentType: z.enum(JENIS_BERKAS),
});
export type BerkasUnggahan = z.input<typeof berkasSchema>;

type Row = typeof pengurusanTpu.$inferSelect;

/** What every step refuses for the same two reasons. */
type Umum = { ok: false; reason: "input_tidak_valid" | "pengurusan_tidak_ditemukan" | "status_tidak_sesuai" };

/** Any Pengurusan order: all three kinds file through this file's steps. */
async function muat(deps: Pick<PengurusanDeps, "db">, nomor: string): Promise<Row | null> {
  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, nomor));
  return order ?? null;
}


function dokumenKurang(order: Row): string[] {
  const ada = order.dokumenDiunggah ?? {};
  return order.dokumenPengajuan.map((dokumen) => dokumen.nama).filter((nama) => !ada[nama]);
}

/** The filing documents still missing, in the checklist's own order. */
export { dokumenKurang as dokumenPengajuanKurang };

// ---------------------------------------------------------------- Dimakamkan

/** A step that names only the order it acts on (Dokumen Lengkap, the Surat Kuasa). */
export const nomorPengurusanSchema = z.object({ nomor: nomorSchema });
export const catatDimakamkanSchema = nomorPengurusanSchema;

export type CatatDimakamkanResult =
  | { ok: true; status: "dimakamkan"; dokumenDueAt: Date }
  | WriteRefusal
  | Umum;

/**
 * Admin Platform records that the burial happened (after checking with the TPU or the family). The
 * pay-after Tagihan's Lewat Jatuh Tempo clock starts from this recorded moment, and the 7-day window
 * for the filing documents opens. One transaction, audited.
 */
export async function catatDimakamkan(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<CatatDimakamkanResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = catatDimakamkanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await muat(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status !== "dikonfirmasi") return { ok: false, reason: "status_tidak_sesuai" };

  const now = deps.clock.now();
  const dokumenDueAt = hariKemudian(now, HARI_BERKAS_PENGAJUAN);
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({ status: "dimakamkan", dimakamkanPada: now, dokumenDueAt })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "dikonfirmasi")))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    // A Harga Khusus may have reissued the Tagihan: the clock runs on the one in force.
    const berlaku = order.tagihanId ? await deps.billing.within(tx).tagihanBerlaku(order.tagihanId) : null;
    if (berlaku) {
      const jam = await deps.billing.within(tx).setOverdueAnchor(berlaku.id, now);
      if (!jam.ok && jam.reason !== "tidak_pay_after") throw new Error(`overdue anchor refused: ${jam.reason}`);
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.catat_dimakamkan",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: "dikonfirmasi" },
      after: { status: "dimakamkan", dokumenDueAt: dokumenDueAt.toISOString() },
      reason: null,
    });
    return { ok: true as const, status: "dimakamkan" as const, dokumenDueAt };
  });
}

// ------------------------------------------------------------ Dokumen unggah

export const unggahSchema = z.object({
  nomor: nomorSchema,
  nama: z.string().trim().min(1).max(200),
  berkas: berkasSchema,
});

export type UnggahDokumenResult =
  | { ok: true; kurang: string[] }
  | Umum
  /** The name is not on this order's filing checklist. */
  | { ok: false; reason: "dokumen_tidak_dikenal" };

/** The Pemesan uploads one filing document (or replaces it) while the order waits at Dimakamkan. */
export async function unggahDokumenPengajuan(
  deps: PengurusanDeps,
  pemesan: { accountId: string },
  rawInput: unknown,
): Promise<UnggahDokumenResult> {
  const parsed = unggahSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { nomor, nama, berkas } = parsed.data;
  const order = await muat(deps, nomor);
  if (!order || order.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (!menerimaUnggahan(order)) return { ok: false, reason: "status_tidak_sesuai" };
  if (!order.dokumenPengajuan.some((dokumen) => dokumen.nama === nama)) return { ok: false, reason: "dokumen_tidak_dikenal" };

  const key = `pengurusan/${order.id}/pengajuan/${crypto.randomUUID()}`;
  await deps.files.put({ key, body: berkas.body, contentType: berkas.contentType });
  const now = deps.clock.now();
  const hasil = await deps.db.transaction(async (tx) => {
    const [terkunci] = await tx.select().from(pengurusanTpu).where(eq(pengurusanTpu.id, order.id)).for("update");
    if (!terkunci || !menerimaUnggahan(terkunci)) return null;
    const lama = terkunci.dokumenDiunggah?.[nama];
    const diunggah: Record<string, DokumenDiunggah> = {
      ...(terkunci.dokumenDiunggah ?? {}),
      [nama]: { key, contentType: berkas.contentType, diunggahPada: now.toISOString() },
    };
    const kurang = dokumenKurang({ ...terkunci, dokumenDiunggah: diunggah });
    // The moment the last document arrives opens the 1-working-day check of a filing-only order (it is set once, at Dimakamkan).
    const lengkapSekarang = kurang.length === 0 && menungguPemeriksaan(terkunci) && !terkunci.berkasLengkapDiunggahPada;
    await tx
      .update(pengurusanTpu)
      .set({ dokumenDiunggah: diunggah, ...(lengkapSekarang ? { berkasLengkapDiunggahPada: now } : {}) })
      .where(eq(pengurusanTpu.id, order.id));
    return { lama, kurang };
  });
  if (!hasil) {
    await deps.files.delete(key).catch(() => undefined);
    return { ok: false, reason: "status_tidak_sesuai" };
  }
  // Best effort: the replaced file is already unreferenced, so a failed delete leaves only an orphan blob, never a wrong order.
  if (hasil.lama) await deps.files.delete(hasil.lama.key).catch(() => undefined);
  return { ok: true, kurang: hasil.kurang };
}

// ---------------------------------------------------------------- Surat Kuasa

/** What the Surat Kuasa page / PDF is printed from: the Operator, the filing staff member and the Pemegang Hak who signs. */
export interface SuratKuasa {
  nomor: string;
  /** The authority goes to the company, represented by the filing staff member named here. */
  penerimaKuasa: { perusahaan: string; wakil: { name: string; phoneNumber: string | null } };
  pemberiKuasa: { name: string; phoneNumber: string | null; email: string | null };
  tpu: { name: string; address: string };
  /** Null for a Perpanjangan TPU, which has no burial. */
  almarhum: { name: string; tanggalWafat: string } | null;
  /** The grave a Tumpang is made in, or the Makam TPU a renewal is for. */
  blokNomor: string | null;
  /** WIB date the page was generated. */
  tanggal: string;
}

async function bangunSuratKuasa(deps: Pick<PengurusanDeps, "db">, order: Row, now: Date): Promise<SuratKuasa | null> {
  // A filing-only order or a Perpanjangan TPU has no confirming staff member: the authority goes to the company alone.
  const berkas = order.kind !== "saat_duka_tpu";
  if (!order.adminPlatformName && !berkas) return null;
  // A Saat Duka TPU order has none before its confirmation; a Perpanjangan TPU needs it from Diajukan, the signed copy being one of its documents.
  if ((order.status === "diajukan" && order.kind !== "perpanjangan_tpu") || order.status === "dibatalkan" || order.status === "ditolak") return null;
  const blokMakam = await blokMakamOf(deps.db, order);
  return {
    nomor: order.nomor,
    penerimaKuasa: {
      perusahaan: NAMA_OPERATOR_SURAT_KUASA,
      wakil: { name: order.adminPlatformName ?? NAMA_OPERATOR_SURAT_KUASA, phoneNumber: order.adminPlatformPhoneNumber },
    },
    pemberiKuasa: { name: order.pemegangHak.name, phoneNumber: order.pemegangHak.phoneNumber, email: order.pemegangHak.email },
    tpu: { name: order.tpuName, address: order.tpuAddress },
    almarhum: order.almarhumName !== null && order.tanggalWafat !== null ? { name: order.almarhumName, tanggalWafat: order.tanggalWafat } : null,
    blokNomor: blokMakam ?? order.kuburan?.blokNomor ?? null,
    tanggal: wibDateOf(now),
  };
}

/** The Surat Kuasa of the Pemesan's own confirmed order, or null (not theirs, not yet confirmed, closed). */
export async function suratKuasa(deps: PengurusanDeps, pemesan: { accountId: string }, nomor: string): Promise<SuratKuasa | null> {
  const order = await muat(deps, nomor);
  if (!order || order.pemesanAccountId !== pemesan.accountId) return null;
  return bangunSuratKuasa(deps, order, deps.clock.now());
}

/**
 * The Surat Kuasa for the page the PdfRenderer opens. No actor: headless Chromium has no session, so the
 * caller (the render page) must have checked the signed, short-lived link made for this order.
 */
export async function suratKuasaUntukCetak(deps: PengurusanDeps, nomor: string): Promise<SuratKuasa | null> {
  const order = await muat(deps, nomor);
  return order ? bangunSuratKuasa(deps, order, deps.clock.now()) : null;
}

/** The same page for Admin Platform (story 147). */
export async function suratKuasaUntukStaf(deps: PengurusanDeps, by: Actor, nomor: string): Promise<SuratKuasa | null> {
  if (writeRefusal(by, "pengurusan.lihat_staf", pengurusanTpuResource())) return null;
  const order = await muat(deps, nomor);
  return order ? bangunSuratKuasa(deps, order, deps.clock.now()) : null;
}

/**
 * The Surat Kuasa as a PDF for the Pemesan to print and sign: the PdfRenderer renders the order's page,
 * the PDF is kept in the private FileStore and handed over as a signed URL valid for 5 minutes (a family
 * document is never an unguessable-but-permanent link). Null when it is not the Pemesan's or not yet confirmed.
 */
export async function suratKuasaPdfUrl(deps: PengurusanDeps, pemesan: { accountId: string }, nomor: string): Promise<string | null> {
  const order = await muat(deps, nomor);
  if (!order || order.pemesanAccountId !== pemesan.accountId) return null;
  const now = deps.clock.now();
  if (!(await bangunSuratKuasa(deps, order, now))) return null;
  const body = await deps.pdf.render({ url: deps.suratKuasaPageUrl(order.nomor, now) });
  const key = `pengurusan/${order.id}/surat-kuasa/${crypto.randomUUID()}.pdf`;
  await deps.files.put({ key, body, contentType: "application/pdf" });
  return deps.files.signedUrl(key, { expiresInSeconds: 300 });
}

// ------------------------------------------------- Dokumen Lengkap, IPTM Diajukan

export type PeriksaDokumenResult =
  | { ok: true; status: "dokumen_lengkap" }
  /** A filing-only order: the documents pass and the pay-first Tagihan is issued in the same step. */
  | { ok: true; status: "menunggu_pembayaran"; tagihan: TagihanBerkas }
  | { ok: false; reason: "tagihan_tidak_terbit" | "harga_tidak_tersedia" }
  /** A Perpanjangan TPU past the masa tenggang: the TPU has not yet been asked (its Tier 3 check row is open). */
  | { ok: false; reason: "cek_tpu_belum_selesai" }
  | WriteRefusal
  | Umum
  | { ok: false; reason: "dokumen_belum_lengkap"; kurang: string[] };

/** Admin Platform has checked the filing documents: refused while any of them is missing. */
export async function periksaDokumen(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<PeriksaDokumenResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = nomorPengurusanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await muat(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (!menungguPemeriksaan(order)) return { ok: false, reason: "status_tidak_sesuai" };
  const kurang = dokumenKurang(order);
  if (kurang.length > 0) return { ok: false, reason: "dokumen_belum_lengkap", kurang };
  if (order.lewatMasaTenggang && !order.cekTpuSelesaiPada) return { ok: false, reason: "cek_tpu_belum_selesai" };
  if (order.kind !== "saat_duka_tpu") return periksaDokumenBerkas(deps, by, order);

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({ status: "dokumen_lengkap", dokumenLengkapPada: now })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "dimakamkan")))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.dokumen_lengkap",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: "dimakamkan" },
      after: { status: "dokumen_lengkap" },
      reason: null,
    });
    return { ok: true as const, status: "dokumen_lengkap" as const };
  });
}

export const ajukanIptmSchema = z.object({
  nomor: nomorSchema,
  /** A Petugas Lapangan to collect the original documents (a Berkas IPTM Tugas Lapangan), when originals are needed. */
  berkasPetugasAccountId: z.string().trim().min(1).optional(),
});

export type AjukanIptmResult =
  | { ok: true; status: "iptm_diajukan"; berkasTugasId: string | null }
  | WriteRefusal
  | Umum
  | { ok: false; reason: "bukan_petugas_lapangan" }
  /** A refiling after a fixable PTSP rejection, while a document it asked for is still missing. */
  | { ok: false; reason: "dokumen_belum_lengkap"; kurang: string[] };

/** Admin Platform has filed on JakEVO: IPTM Diajukan, with an optional Berkas IPTM Tugas Lapangan for the originals. */
export async function ajukanIptm(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<AjukanIptmResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = ajukanIptmSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await muat(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  // A Saat Duka TPU order is filed once its documents are checked; a filing-only one once its Tagihan is Lunas (Diproses);
  // either one again after a fixable PTSP rejection (Perlu Perbaikan), at no charge, once the documents asked for are in.
  const dariStatus = order.kind === "saat_duka_tpu" ? "dokumen_lengkap" : "diproses";
  if (order.status !== dariStatus && order.status !== "perlu_perbaikan") return { ok: false, reason: "status_tidak_sesuai" };
  const diajukanUlang = order.status === "perlu_perbaikan";
  if (diajukanUlang) {
    const kurang = dokumenKurang(order);
    if (kurang.length > 0) return { ok: false, reason: "dokumen_belum_lengkap", kurang };
  }

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({ status: "iptm_diajukan", iptmDiajukanPada: now, ...(diajukanUlang ? { perbaikan: null, alasan: null } : {}) })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, order.status)))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    let berkasTugasId: string | null = null;
    if (parsed.data.berkasPetugasAccountId) {
      const tugas = await deps.fieldwork.within(tx).createTugasLapangan(by, {
        type: "berkas_iptm",
        subject: `Berkas IPTM ${order.tpuName} · ${order.nomor}`,
        lokasiId: null,
        address: `${order.tpuName}, ${order.tpuAddress}`,
        pin: null,
        plannedDate: wibDateOf(now),
        assigneeAccountId: parsed.data.berkasPetugasAccountId,
      });
      if (!tugas.ok) return { ok: false as const, reason: "bukan_petugas_lapangan" as const };
      berkasTugasId = tugas.tugasLapangan.id;
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.iptm_diajukan",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: order.status },
      after: { status: "iptm_diajukan", berkasTugasId },
      reason: null,
    });
    return { ok: true as const, status: "iptm_diajukan" as const, berkasTugasId };
  });
}

// ---------------------------------------------------------------- IPTM Terbit

export const terbitkanIptmSchema = z.object({
  nomor: nomorSchema,
  berkas: berkasSchema,
  /** The IPTM's expiry, "YYYY-MM-DD". */
  berlakuSampai: z.iso.date(),
  /** The grave's blok and number as the IPTM states them; required unless a Tumpang order already names the grave. */
  blokNomor: z.string().trim().min(1).max(120).optional(),
});

export type TerbitkanIptmResult =
  | { ok: true; status: "iptm_terbit"; makamTpuId: string; diperbarui: boolean }
  | WriteRefusal
  | Umum
  | { ok: false; reason: "kedaluwarsa_di_masa_lalu" | "blok_nomor_wajib" };

/**
 * Admin Platform uploads the IPTM scan and its expiry: IPTM Terbit. The Makam TPU is created, or
 * (a Tumpang, or any order for a grave already on record) updated with the Almarhum, the Pemegang
 * Hak, the new current IPTM and a history entry. The scan goes to the Pemesan and the Pemegang Hak
 * whatever the Tagihan's status. Audited; the message goes out once the write has committed.
 */
export async function terbitkanIptm(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<TerbitkanIptmResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = terbitkanIptmSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const order = await muat(deps, input.nomor);
  if (!order) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status !== "iptm_diajukan") return { ok: false, reason: "status_tidak_sesuai" };
  const now = deps.clock.now();
  if (input.berlakuSampai <= wibDateOf(now)) return { ok: false, reason: "kedaluwarsa_di_masa_lalu" };
  // A renewal is for a Makam TPU already on record: its Blok is that record's own.
  const blokNomor = input.blokNomor ?? (await blokMakamOf(deps.db, order)) ?? order.kuburan?.blokNomor;
  if (!blokNomor) return { ok: false, reason: "blok_nomor_wajib" };

  const scanKey = `pengurusan/${order.id}/iptm/${crypto.randomUUID()}`;
  await deps.files.put({ key: scanKey, body: input.berkas.body, contentType: input.berkas.contentType });
  const kunci = blokNomor.trim().toLowerCase();
  let hasil: TerbitkanIptmResult;
  try {
    hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
      const moved = await tx
        .update(pengurusanTpu)
        .set({ status: "iptm_terbit", iptmTerbitPada: now, iptmScanKey: scanKey, iptmBerlakuSampai: input.berlakuSampai })
        .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "iptm_diajukan")))
        .returning({ id: pengurusanTpu.id });
      if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };

      const entri = { scanKey, berlakuSampai: input.berlakuSampai, diterbitkanPada: now.toISOString(), nomorPengurusan: order.nomor };
      // A Perpanjangan TPU buries no one: it adds no Almarhum to the record.
      const almarhumBaru = order.almarhumName !== null && order.tanggalWafat !== null ? { name: order.almarhumName, tanggalWafat: order.tanggalWafat } : null;
      // A Tumpang names a grave that already holds someone: if no record of it exists yet, that person belongs in it too.
      const almarhumAwal = order.kuburan ? [{ name: order.kuburan.nama, tanggalWafat: "" }] : [];

      const ditemukan = await tx
        .select()
        .from(makamTpu)
        .where(and(eq(makamTpu.tpuId, order.tpuId), eq(makamTpu.blokNomorKunci, kunci)))
        .for("update");
      let makamId: string;
      let diperbarui: boolean;
      if (ditemukan[0]) {
        const ada = ditemukan[0];
        const sudah = almarhumBaru === null || ada.almarhum.some((satu) => satu.name.trim().toLowerCase() === almarhumBaru.name.trim().toLowerCase());
        await tx
          .update(makamTpu)
          .set({
            almarhum: sudah || almarhumBaru === null ? ada.almarhum : [...ada.almarhum, almarhumBaru],
            pemegangHak: order.pemegangHak,
            pemegangAccountId: order.pemesanAccountId,
            iptmScanKey: scanKey,
            iptmBerlakuSampai: input.berlakuSampai,
            riwayatIptm: [...ada.riwayatIptm, entri],
            updatedAt: now,
          })
          .where(eq(makamTpu.id, ada.id));
        makamId = ada.id;
        diperbarui = true;
      } else {
        const [baru] = await tx
          .insert(makamTpu)
          .values({
            tpuId: order.tpuId,
            tpuName: order.tpuName,
            blokNomor: blokNomor.trim(),
            blokNomorKunci: kunci,
            almarhum: almarhumBaru ? [...almarhumAwal, almarhumBaru] : almarhumAwal,
            pemegangHak: order.pemegangHak,
            pemegangAccountId: order.pemesanAccountId,
            iptmScanKey: scanKey,
            iptmBerlakuSampai: input.berlakuSampai,
            riwayatIptm: [entri],
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: makamTpu.id });
        if (!baru) throw new Error("Makam TPU was not created");
        makamId = baru.id;
        diperbarui = false;
      }
      await tx.update(pengurusanTpu).set({ makamTpuId: makamId }).where(eq(pengurusanTpu.id, order.id));
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "pengurusan.iptm_terbit",
        entity: { kind: "pengurusan_tpu", id: order.id },
        lokasiId: null,
        before: { status: "iptm_diajukan" },
        after: { status: "iptm_terbit", makamTpuId: makamId, berlakuSampai: input.berlakuSampai, diperbarui },
        reason: null,
      });
      return { ok: true as const, status: "iptm_terbit" as const, makamTpuId: makamId, diperbarui };
    });
  } catch (error) {
    await deps.files.delete(scanKey).catch(() => undefined);
    throw error;
  }
  if (!hasil.ok) {
    await deps.files.delete(scanKey).catch(() => undefined);
    return hasil;
  }
  // After the commit: a message for a rolled-back write is worse than one that is a moment late.
  await deps.notifikasi.iptmTerbit({
    pengurusanId: order.id,
    nomor: order.nomor,
    email: order.email,
    tpu: { name: order.tpuName },
    almarhumName: order.almarhumName,
    pemegangHak: { name: order.pemegangHak.name, email: order.pemegangHak.email },
    berlakuSampai: input.berlakuSampai,
  });
  return hasil;
}

// ------------------------------------------------------------- Pembatalan

export const batalkanSchema = z.object({ nomor: nomorSchema, alasan: z.string().trim().max(500).default("") });

export type BatalkanPengurusanResult =
  | {
      ok: true;
      status: "dibatalkan";
      /** The Tagihan voided with the order (an unpaid one); null when it was paid or there was none. */
      tagihanDibatalkan: boolean;
      /** The refund asked of Admin Platform for a paid order: whole rupiah; 0 when nothing came back. */
      pengembalian: number;
    }
  | Umum
  /** The IPTM is already filed (or issued): too late to cancel. */
  | { ok: false; reason: "sudah_diajukan" }
  | { ok: false; reason: "tagihan_tidak_dibatalkan" | "pengembalian_tidak_terbit" };


/** Nothing to cancel: an order that is not a Saat Duka TPU one has no hari-H Layanan. */
const TANPA_HARI_H = { ok: true as const, dibatalkan: 0, baris: [], tidakDikembalikan: 0 };

/**
 * The Pemesan cancels before the IPTM is filed. The order, its hari-H Layanan, the Tagihan and the refund request all
 * commit together or not at all: an unpaid Tagihan is voided; a paid one is refunded in full before Dimakamkan, and
 * at or past it everything except the Biaya Pengurusan. A Saat Duka TPU order's hari-H Layanan not yet done are
 * cancelled with it (ticket 117) and are the only Layanan lines refunded: one already begun or done keeps its price, and
 * the refund (owner decision 2026-10-02) is the order's own lines plus exactly the jobs cancelled here.
 */
export async function batalkanPengurusan(
  deps: PengurusanDeps,
  pemesan: { accountId: string },
  rawInput: unknown,
): Promise<BatalkanPengurusanResult> {
  const parsed = batalkanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await muat(deps, parsed.data.nomor);
  if (!order || order.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status === "iptm_diajukan" || order.status === "iptm_terbit") return { ok: false, reason: "sudah_diajukan" };
  if (!STATUS_BOLEH_DIBATALKAN.includes(order.status)) return { ok: false, reason: "status_tidak_sesuai" };

  const now = deps.clock.now();
  const sudahDimakamkan = STATUS_SUDAH_DIMAKAMKAN.includes(order.status);
  const saatDukaTpu = order.kind === "saat_duka_tpu";
  return refusable<BatalkanPengurusanResult>(deps.db, async (tx) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({ status: "dibatalkan", dibatalkanPada: now, alasan: parsed.data.alasan === "" ? null : parsed.data.alasan })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, order.status)))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };

    // The hari-H Layanan end with the order, paid or not: Layanan cancels what is not yet done and names the lines to refund for it.
    const hariH = saatDukaTpu ? await deps.layanan.batalkanHariHTpu(order.nomor, tx) : TANPA_HARI_H;
    if (!hariH.ok) return { ok: false as const, reason: "pengembalian_tidak_terbit" as const };

    let tagihanDibatalkan = false;
    let pengembalian = 0;
    const berlaku = order.tagihanId ? await deps.billing.within(tx).tagihanBerlaku(order.tagihanId) : null;
    if (berlaku && berlaku.status === "lunas") {
      const lines = [
        ...berlaku.lines
          // A hari-H Layanan line comes back only through its job, below: one begun or done is not refunded.
          .filter((line) => !(saatDukaTpu && line.kind === "layanan"))
          .filter((line) => line.kind !== "penyesuaian_harga_khusus" && line.kind !== "biaya_layanan_platform")
          .filter((line) => !(sudahDimakamkan && line.kind === "biaya_pengurusan"))
          .map((line) => ({
            label: line.label,
            amount: nilaiDibayarBaris(berlaku.lines, line),
            lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null,
          }))
          .filter((line) => line.amount > 0),
        ...hariH.baris,
      ];
      if (lines.length > 0) {
        // Two flags, two meanings. `penuh` claims that everything comes back (before Dimakamkan, no Layanan kept or refunded earlier):
        // Refunds refuses the request, and with it the cancellation, when the lines do not add up to the whole Tagihan. `penuhBilaLengkap`
        // is the lenient one: before Dimakamkan the request is marked penuh when it completes the Tagihan with what was refunded earlier
        // (a Terlambat job the Pemesan cancelled before), and is an ordinary partial request, never refused, when it does not.
        const diajukan = await deps.refunds.ajukanBaris(
          berlaku.id,
          { pihakBersalah: "pemesan", penuh: !sudahDimakamkan && hariH.tidakDikembalikan === 0, penuhBilaLengkap: !sudahDimakamkan, lines },
          tx,
        );
        if (!diajukan.ok) return { ok: false as const, reason: "pengembalian_tidak_terbit" as const };
        pengembalian = diajukan.jumlah;
      }
    } else if (berlaku && berlaku.status !== "dibatalkan") {
      const batal = await deps.billing.within(tx).batalkanTagihan(berlaku.id, { alasan: "pemesanan_dibatalkan", hanyaBelumDibayar: true });
      if (!batal.ok) return { ok: false as const, reason: "tagihan_tidak_dibatalkan" as const };
      tagihanDibatalkan = true;
    }
    return { ok: true as const, status: "dibatalkan" as const, tagihanDibatalkan, pengembalian };
  });
}

// --------------------------------------------------------------- Reads

/** One Makam TPU, as its Pemegang Hak's Makam tab shows it. */
export interface MakamTpu {
  id: string;
  tpu: { id: string; name: string };
  blokNomor: string;
  almarhum: { name: string; tanggalWafat: string }[];
  pemegangHak: { name: string; phoneNumber: string | null; email: string | null };
  iptm: { berlakuSampai: string };
  riwayatIptm: { berlakuSampai: string; diterbitkanPada: string; nomorPengurusan: string }[];
}

function toMakam(row: typeof makamTpu.$inferSelect): MakamTpu {
  return {
    id: row.id,
    tpu: { id: row.tpuId, name: row.tpuName },
    blokNomor: row.blokNomor,
    almarhum: row.almarhum,
    pemegangHak: { name: row.pemegangHak.name, phoneNumber: row.pemegangHak.phoneNumber, email: row.pemegangHak.email },
    iptm: { berlakuSampai: row.iptmBerlakuSampai },
    riwayatIptm: row.riwayatIptm.map((entri) => ({
      berlakuSampai: entri.berlakuSampai,
      diterbitkanPada: entri.diterbitkanPada,
      nomorPengurusan: entri.nomorPengurusan,
    })),
  };
}

/** Every Makam TPU of that Akun (the Makam tab), by TPU and grave. */
export async function makamTpuSaya(deps: Pick<PengurusanDeps, "db">, pemesan: { accountId: string }): Promise<MakamTpu[]> {
  const rows = await deps.db.select().from(makamTpu).where(eq(makamTpu.pemegangAccountId, pemesan.accountId));
  return rows.map(toMakam).sort((a, b) => a.tpu.name.localeCompare(b.tpu.name) || a.blokNomor.localeCompare(b.blokNomor));
}

/**
 * The grave a Makam TPU is, in the words the TPU Layanan order asks for, so ordering a Layanan from
 * the Makam tab prefills it instead of the family typing it again (ticket 46; ticket 56's order).
 */
export async function deskripsiMakamTpu(
  deps: Pick<PengurusanDeps, "db">,
  pemesan: { accountId: string },
  makamTpuId: string,
): Promise<{ tpuId: string; blokNomor: string; almarhumName: string } | null> {
  const [row] = await deps.db.select().from(makamTpu).where(eq(makamTpu.id, makamTpuId));
  if (!row || row.pemegangAccountId !== pemesan.accountId) return null;
  const terakhir = row.almarhum[row.almarhum.length - 1];
  return { tpuId: row.tpuId, blokNomor: row.blokNomor, almarhumName: terakhir?.name ?? "" };
}

/** A short-lived link to the order's current IPTM scan, for its own Pemesan; null while none is issued. */
export async function iptmScanUrl(deps: PengurusanDeps, pemesan: { accountId: string }, nomor: string): Promise<string | null> {
  const order = await muat(deps, nomor);
  if (!order || order.pemesanAccountId !== pemesan.accountId || !order.iptmScanKey) return null;
  return deps.files.signedUrl(order.iptmScanKey, { expiresInSeconds: 300 });
}

/** A Dimakamkan order whose filing documents are still missing: what the Pemesan's Perlu tindakan shows. */
export interface PerluTindakanBerkas {
  nomor: string;
  tpuName: string;
  kurang: string[];
  /** The 7-day window's end; null for a Perpanjangan TPU, whose uploads have no window. */
  dueAt: Date | null;
  /** Past the 7-day window; never for an order in Perlu Perbaikan, which waits on a correction and not on the window. */
  terlambat: boolean;
  /** What the PTSP asked to be corrected; null while the documents are simply not all in. */
  alasanPerbaikan: string | null;
}

export async function perluTindakanBerkas(deps: PengurusanDeps, pemesan: { accountId: string }): Promise<PerluTindakanBerkas[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(
      and(eq(pengurusanTpu.pemesanAccountId, pemesan.accountId), inArray(pengurusanTpu.status, [...STATUS_MENERIMA_UNGGAHAN])),
    );
  const now = deps.clock.now();
  return rows
    .map((row) => ({ row, kurang: dokumenKurang(row) }))
    .filter(({ kurang }) => kurang.length > 0)
    .map(({ row, kurang }) => ({
      nomor: row.nomor,
      tpuName: row.tpuName,
      kurang,
      dueAt: row.dokumenDueAt,
      terlambat: row.status === "dimakamkan" && row.dokumenDueAt !== null && row.dokumenDueAt.getTime() < now.getTime(),
      alasanPerbaikan: row.status === "perlu_perbaikan" ? (row.perbaikan?.alasan ?? row.alasan) : null,
    }))
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
}

/** One order waiting to be filed on JakEVO: the Antrean's Tier 3 "IPTM filing" row (7 days from Dokumen Lengkap). */
export interface PengajuanIptmTerbuka {
  id: string;
  nomor: string;
  tpuName: string;
  almarhumName: string | null;
  dokumenLengkapPada: Date;
  dueAt: Date;
}

/** Every Dokumen Lengkap order, oldest first. No actor: the Antrean checks `antrean.lihat` (like `konfirmasiTpuTerbuka`). */
export async function pengajuanIptmTerbuka(deps: Pick<PengurusanDeps, "db">): Promise<PengajuanIptmTerbuka[]> {
  const rows = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.status, "dokumen_lengkap"));
  return rows
    .filter((row) => row.dokumenLengkapPada)
    .map((row) => ({
      id: row.id,
      nomor: row.nomor,
      tpuName: row.tpuName,
      almarhumName: row.almarhumName,
      dokumenLengkapPada: row.dokumenLengkapPada!,
      dueAt: hariKemudian(row.dokumenLengkapPada!, 7),
    }))
    .sort((a, b) => a.dokumenLengkapPada.getTime() - b.dokumenLengkapPada.getTime());
}
