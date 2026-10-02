/**
 * Pengurusan IPTM, the filing-only order (spec, Pengurusan: "Sudah dimakamkan? Kami urus IPTM-nya", payment rule,
 * PTSP rejection; Field Work: surat pengantar on Lunas; Work Queues: Tier 3 document check and filing; stories 78
 * and 82; ticket 47). The order starts Dimakamkan (placed in `saat-duka-tpu.ts`, uploads and the Pemesan's
 * cancellation in `pengajuan-iptm.ts`, which share their steps with a Saat Duka TPU order); this file holds what is
 * particular to filing only:
 *
 *   Dimakamkan -> (documents checked) Dokumen Lengkap + pay-first Tagihan -> Menunggu Pembayaran
 *     -> (Tagihan Lunas) Diproses -> IPTM Diajukan -> IPTM Terbit
 *   Menunggu Pembayaran -> Dibatalkan when the Tagihan lapses unpaid after 3×24 h.
 *   IPTM Diajukan -> Perlu Perbaikan (fixable PTSP rejection, refiled at no charge) | Ditolak (final, refunded in full).
 *
 * Nothing is billed before the documents pass. Whether the Tagihan is Lunas or has lapsed is Billing's fact, read
 * through its public function by an idempotent tick, never restated here. The Ambil surat pengantar Tugas needs a
 * Petugas Lapangan and so an Admin Platform to pick one: it can only be made once the Tagihan is Lunas.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { nilaiDibayarBaris, withinPaymentCap } from "@/domain/billing";
import { pengurusanTpuResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { wibDateOf } from "@/lib/time/jakarta";
import type { PengurusanDeps } from "./deps";
import { barisTagihan } from "./konfirmasi-saat-duka-tpu";
import type { PeriksaDokumenResult } from "./pengajuan-iptm";
import { pengurusanTpu, type PengurusanTpuStatus } from "./schema";

type Row = typeof pengurusanTpu.$inferSelect;

/** Admin Platform's 1 working day to check the documents once the last one is in. */
export const HARI_KERJA_PERIKSA_BERKAS = 1;
/** Admin Platform's 3 working days to file once the Tagihan is Lunas. */
export const HARI_KERJA_AJUKAN_BERKAS = 3;

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

export interface TagihanBerkas {
  id: string;
  nomorTagihan: string;
  total: number;
  dueAt: Date;
  link: string;
}

const sehari = 24 * 60 * 60 * 1000;

/** `n` working days on the Admin Platform calendar; calendar days while that calendar has no hours (the row must still exist). */
async function tenggat(deps: Pick<PengurusanDeps, "lokasi">, dari: Date, n: number): Promise<Date> {
  const hasil = addWorkingDays(await deps.lokasi.adminPlatformCalendar(), dari, n);
  return hasil.ok ? hasil.at : new Date(dari.getTime() + n * sehari);
}

// ---------------------------------------------------- the check and the Tagihan

/**
 * The documents are all in and Admin Platform has checked them: Dokumen Lengkap, and the pay-first Tagihan (the
 * filing-only Biaya Pengurusan and the Retribusi Pemda, no Biaya Layanan Platform) due 3×24 h after issue is issued
 * in the same transaction, so the order is Menunggu Pembayaran. Called by `periksaDokumen` after it has checked the
 * actor, the status and that no document is missing.
 */
export async function periksaDokumenBerkas(deps: PengurusanDeps, by: Actor, order: Row): Promise<PeriksaDokumenResult> {
  const now = deps.clock.now();
  const dikutip = await deps.tariffs.quote(
    [
      { kind: "biaya_pengurusan", pengurusan: "berkas" },
      { kind: "retribusi_pemda", retribusi: "iptm" },
    ],
    now,
  );
  if (!dikutip.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris = barisTagihan(dikutip.lines);
  if (!baris.ok || !withinPaymentCap(baris.total)) return { ok: false, reason: "harga_tidak_tersedia" };
  const phoneNumber = order.pemegangHak.phoneNumber ?? order.phoneNumber;
  if (!phoneNumber) return { ok: false, reason: "tagihan_tidak_terbit" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "pengurusan_berkas" },
      addressee: { name: order.pemesanName, phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.tpuName,
      lines: baris.lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };
    const diumumkan = await deps.notifikasi.tagihanTerbit(
      {
        tagihanId: tagihan.tagihan.id,
        momentKind: "pengurusan_berkas",
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        nomorPemesanan: order.nomor,
        email: order.email,
        perihal: `Pengurusan IPTM di ${order.tpuName}`,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
      tx,
    );
    if (!diumumkan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };
    const moved = await tx
      .update(pengurusanTpu)
      .set({
        status: "menunggu_pembayaran",
        dokumenLengkapPada: now,
        tagihanId: tagihan.tagihan.id,
        tagihanNomor: tagihan.tagihan.nomorTagihan,
        harga: baris.harga,
        adminPlatformAccountId: by.accountId,
      })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "dimakamkan")))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.dokumen_lengkap",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: "dimakamkan" },
      after: { status: "menunggu_pembayaran", nomorTagihan: tagihan.tagihan.nomorTagihan },
      reason: null,
    });
    return {
      ok: true as const,
      status: "menunggu_pembayaran" as const,
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
    };
  });
}

// --------------------------------------------------- Lunas and the lapse (tick)

/**
 * Follows the pay-first Tagihan of every Menunggu Pembayaran order: Lunas makes it Diproses (the moment it was seen
 * paid opens the 3-working-day filing); a Tagihan Billing has cancelled for lapsing makes it Dibatalkan. A write is
 * conditional on the order still waiting, so running it again, or two at once, changes nothing twice.
 */
export async function pembayaranBerkasTick(deps: Pick<PengurusanDeps, "db" | "billing">, now: Date): Promise<void> {
  const menunggu = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "pengurusan_iptm"), eq(pengurusanTpu.status, "menunggu_pembayaran")));
  for (const order of menunggu) {
    if (!order.tagihanId) continue;
    const tagihan = await deps.billing.tagihanBerlaku(order.tagihanId);
    if (!tagihan) continue;
    if (tagihan.status === "lunas") {
      await deps.db
        .update(pengurusanTpu)
        .set({ status: "diproses", lunasPada: now })
        .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "menunggu_pembayaran")));
    } else if (tagihan.status === "dibatalkan") {
      await deps.db
        .update(pengurusanTpu)
        .set({
          status: "dibatalkan",
          dibatalkanPada: now,
          alasan: tagihan.cancelledReason === "batas_pembayaran_lewat" ? "Batas pembayaran lewat" : null,
        })
        .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "menunggu_pembayaran")));
    }
  }
}

// ------------------------------------------------------- Ambil surat pengantar

export const buatSuratPengantarSchema = z.object({ nomor: nomorSchema, petugasAccountId: z.string().trim().min(1) });

export type BuatSuratPengantarResult =
  | { ok: true; tugasId: string }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pengurusan_tidak_ditemukan" | "status_tidak_sesuai" }
  /** The Tagihan is not Lunas: the surat pengantar is fetched only for a paid order. */
  | { ok: false; reason: "belum_lunas" }
  | { ok: false; reason: "sudah_dibuat" | "bukan_petugas_lapangan" };

const SESUDAH_BAYAR: PengurusanTpuStatus[] = ["menunggu_pembayaran", "diproses", "iptm_diajukan", "perlu_perbaikan"];

/**
 * Admin Platform makes the Ambil surat pengantar Tugas Lapangan of a filing-only order, for a Petugas Lapangan to
 * fetch the letter from the TPU: only once the Tagihan is Lunas, and once. Audited.
 */
export async function buatSuratPengantar(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<BuatSuratPengantarResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = buatSuratPengantarSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await muatBerkas(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (!SESUDAH_BAYAR.includes(order.status)) return { ok: false, reason: "status_tidak_sesuai" };
  if (order.suratPengantarTugasId) return { ok: false, reason: "sudah_dibuat" };
  const tagihan = order.tagihanId ? await deps.billing.tagihanBerlaku(order.tagihanId) : null;
  if (!tagihan || tagihan.status !== "lunas") return { ok: false, reason: "belum_lunas" };

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const tugas = await deps.fieldwork.within(tx).createTugasLapangan(by, {
      type: "ambil_surat_pengantar",
      subject: `Surat pengantar ${order.tpuName} · ${order.nomor}`,
      lokasiId: null,
      address: `${order.tpuName}, ${order.tpuAddress}`,
      pin: null,
      plannedDate: wibDateOf(now),
      assigneeAccountId: parsed.data.petugasAccountId,
    });
    if (!tugas.ok) return { ok: false as const, reason: "bukan_petugas_lapangan" as const };
    const moved = await tx
      .update(pengurusanTpu)
      .set({ suratPengantarTugasId: tugas.tugasLapangan.id })
      .where(and(eq(pengurusanTpu.id, order.id), isNull(pengurusanTpu.suratPengantarTugasId)))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "sudah_dibuat" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.surat_pengantar_dibuat",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: null,
      after: { tugasId: tugas.tugasLapangan.id, petugasAccountId: parsed.data.petugasAccountId },
      reason: null,
    });
    return { ok: true as const, tugasId: tugas.tugasLapangan.id };
  });
}

// ------------------------------------------------------------ PTSP rejection

export const tolakPtspSchema = z.discriminatedUnion("putusan", [
  z.object({
    putusan: z.literal("perbaikan"),
    nomor: nomorSchema,
    /** What the PTSP found wrong, in words the family can act on. */
    alasan: z.string().trim().min(1).max(500),
    /** The checklist documents to upload again. */
    dokumen: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  }),
  z.object({ putusan: z.literal("final"), nomor: nomorSchema, alasan: z.string().trim().min(1).max(500) }),
]);

export type TolakPtspResult =
  | { ok: true; status: "perlu_perbaikan" }
  | { ok: true; status: "ditolak"; pengembalian: number }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pengurusan_tidak_ditemukan" | "status_tidak_sesuai" | "dokumen_tidak_dikenal" }
  /** A final rejection's full refund is for a filing-only order; a Saat Duka TPU one is not decided here. */
  | { ok: false; reason: "bukan_pengurusan_berkas" }
  | { ok: false; reason: "pengembalian_tidak_terbit" };

/**
 * The PTSP's answer to a filing, recorded by Admin Platform on an IPTM Diajukan order. A fixable rejection (a missing
 * or unclear document, a Surat Kuasa problem) sends the order back to Perlu Perbaikan with the documents to upload
 * again and the reason; the Tagihan is untouched and the refiling creates none. A final rejection closes it Ditolak with
 * the reason shown and asks for the whole Tagihan back, the Biaya Pengurusan included, the Operator carrying the loss.
 */
export async function tolakPtsp(deps: PengurusanDeps, by: Actor, rawInput: unknown): Promise<TolakPtspResult> {
  const refusal = writeRefusal(by, "pengurusan.konfirmasi", pengurusanTpuResource());
  if (refusal) return refusal;
  const parsed = tolakPtspSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, input.nomor));
  if (!order || (order.kind !== "pengurusan_iptm" && order.kind !== "saat_duka_tpu")) return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status !== "iptm_diajukan") return { ok: false, reason: "status_tidak_sesuai" };
  const now = deps.clock.now();

  if (input.putusan === "perbaikan") {
    const dikenal = new Set(order.dokumenPengajuan.map((dokumen) => dokumen.nama));
    if (!input.dokumen.every((nama) => dikenal.has(nama))) return { ok: false, reason: "dokumen_tidak_dikenal" };
    const lama = Object.entries(order.dokumenDiunggah ?? {}).filter(([nama]) => input.dokumen.includes(nama));
    const sisa = Object.fromEntries(Object.entries(order.dokumenDiunggah ?? {}).filter(([nama]) => !input.dokumen.includes(nama)));
    const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
      const moved = await tx
        .update(pengurusanTpu)
        .set({
          status: "perlu_perbaikan",
          alasan: input.alasan,
          perbaikan: { alasan: input.alasan, dokumen: input.dokumen, pada: now.toISOString() },
          dokumenDiunggah: sisa,
        })
        .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "iptm_diajukan")))
        .returning({ id: pengurusanTpu.id });
      if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "pengurusan.ptsp_perbaikan",
        entity: { kind: "pengurusan_tpu", id: order.id },
        lokasiId: null,
        before: { status: "iptm_diajukan" },
        after: { status: "perlu_perbaikan", dokumen: input.dokumen },
        reason: input.alasan,
      });
      return { ok: true as const, status: "perlu_perbaikan" as const };
    });
    if (hasil.ok) for (const [, berkas] of lama) await deps.files.delete(berkas.key).catch(() => undefined);
    return hasil;
  }

  if (order.kind !== "pengurusan_iptm") return { ok: false, reason: "bukan_pengurusan_berkas" };
  return deps.audit.staffWrite<TolakPtspResult>(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({ status: "ditolak", alasan: input.alasan, ditolakPada: now })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "iptm_diajukan")))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    let pengembalian = 0;
    const berlaku = order.tagihanId ? await deps.billing.within(tx).tagihanBerlaku(order.tagihanId) : null;
    if (berlaku && berlaku.status === "lunas") {
      const lines = berlaku.lines
        .filter((line) => line.kind !== "penyesuaian_harga_khusus" && line.kind !== "biaya_layanan_platform")
        .map((line) => ({
          label: line.label,
          amount: nilaiDibayarBaris(berlaku.lines, line),
          lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null,
        }))
        .filter((line) => line.amount > 0);
      if (lines.length > 0) {
        const diajukan = await deps.refunds.ajukanBaris(berlaku.id, { pihakBersalah: "operator", penuh: true, lines }, tx);
        if (!diajukan.ok) return { ok: false as const, reason: "pengembalian_tidak_terbit" as const };
        pengembalian = diajukan.jumlah;
      }
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.ptsp_ditolak",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: "iptm_diajukan" },
      after: { status: "ditolak", pengembalian },
      reason: input.alasan,
    });
    return { ok: true as const, status: "ditolak" as const, pengembalian };
  });
}

// ------------------------------------------------------------ Tier 3 rows

/** A filing-only order whose documents are all in, waiting for Admin Platform to check them. */
export interface PeriksaBerkasTerbuka {
  id: string;
  nomor: string;
  tpuName: string;
  almarhumName: string;
  /** When the last document came in. */
  lengkapDiunggahPada: Date;
  /** 1 working day after that, on the Admin Platform calendar. */
  dueAt: Date;
}

/** Every Dimakamkan filing-only order with all its documents in, oldest first. No actor: the caller checks `antrean.lihat`. */
export async function periksaBerkasTerbuka(deps: Pick<PengurusanDeps, "db" | "lokasi">): Promise<PeriksaBerkasTerbuka[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "pengurusan_iptm"), eq(pengurusanTpu.status, "dimakamkan")));
  const siap = rows.filter((row) => row.berkasLengkapDiunggahPada !== null);
  const hasil = await Promise.all(
    siap.map(async (row) => ({
      id: row.id,
      nomor: row.nomor,
      tpuName: row.tpuName,
      almarhumName: row.almarhumName,
      lengkapDiunggahPada: row.berkasLengkapDiunggahPada!,
      dueAt: await tenggat(deps, row.berkasLengkapDiunggahPada!, HARI_KERJA_PERIKSA_BERKAS),
    })),
  );
  return hasil.sort((a, b) => a.lengkapDiunggahPada.getTime() - b.lengkapDiunggahPada.getTime());
}

/** A paid filing-only order waiting to be filed on JakEVO. */
export interface PengajuanBerkasTerbuka {
  id: string;
  nomor: string;
  tpuName: string;
  almarhumName: string;
  lunasPada: Date;
  /** 3 working days after Lunas, on the Admin Platform calendar. */
  dueAt: Date;
  /** Whether the Ambil surat pengantar Tugas has been made. */
  suratPengantarDibuat: boolean;
}

/** Every Diproses filing-only order, oldest first. No actor: the caller checks `antrean.lihat`. */
export async function pengajuanBerkasTerbuka(deps: Pick<PengurusanDeps, "db" | "lokasi">): Promise<PengajuanBerkasTerbuka[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "pengurusan_iptm"), inArray(pengurusanTpu.status, ["diproses"])));
  const hasil = await Promise.all(
    rows
      .filter((row) => row.lunasPada !== null)
      .map(async (row) => ({
        id: row.id,
        nomor: row.nomor,
        tpuName: row.tpuName,
        almarhumName: row.almarhumName,
        lunasPada: row.lunasPada!,
        dueAt: await tenggat(deps, row.lunasPada!, HARI_KERJA_AJUKAN_BERKAS),
        suratPengantarDibuat: row.suratPengantarTugasId !== null,
      })),
  );
  return hasil.sort((a, b) => a.lunasPada.getTime() - b.lunasPada.getTime());
}

async function muatBerkas(deps: Pick<PengurusanDeps, "db">, nomor: string): Promise<Row | null> {
  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, nomor));
  return order && order.kind === "pengurusan_iptm" ? order : null;
}
