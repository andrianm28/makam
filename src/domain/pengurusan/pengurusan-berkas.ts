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
 * through its public function by an idempotent tick, never restated here. The Ambil surat pengantar Tugas is made by
 * that tick when the Tagihan is Lunas, unassigned; an Admin Platform assigns it from the Antrean.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { nilaiDibayarBaris, withinPaymentCap } from "@/domain/billing";
import { pengurusanTpuResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { wibDateOf } from "@/lib/time/jakarta";
import { buatTugasSistem } from "@/domain/fieldwork";
import type { PengurusanDeps } from "./deps";
import { hariKemudian, menungguPemeriksaan } from "./aturan";
import { barisTagihan } from "./konfirmasi-saat-duka-tpu";
import type { PeriksaDokumenResult } from "./pengajuan-iptm";
import { pengurusanTpu } from "./schema";

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

/** `n` working days on the Admin Platform calendar; calendar days while that calendar has no hours (the row must still exist). */
async function tenggat(deps: Pick<PengurusanDeps, "lokasi">, dari: Date, n: number): Promise<Date> {
  const hasil = addWorkingDays(await deps.lokasi.adminPlatformCalendar(), dari, n);
  return hasil.ok ? hasil.at : hariKemudian(dari, n);
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
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, order.status)))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.dokumen_lengkap",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: order.status },
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
 * paid opens the 3-working-day filing) and, in that same transaction, makes the order's Ambil surat pengantar Tugas
 * Lapangan, unassigned, for an Admin Platform to hand to a Petugas (story 146); a Tagihan Billing has cancelled for
 * lapsing makes it Dibatalkan. Each order moves in one transaction, conditional on it still waiting, so running the
 * tick again, or two at once, changes nothing twice and makes one Tugas. These are facts of the system following
 * Billing's, not staff writes, so they record no Entri Audit (the Tagihan's own payment and lapse are Billing's record).
 */
export async function pembayaranBerkasTick(
  deps: { db: PengurusanDeps["db"]; billing: Pick<PengurusanDeps["billing"], "tagihanBerlaku"> },
  now: Date,
): Promise<void> {
  const menunggu = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "pengurusan_iptm"), eq(pengurusanTpu.status, "menunggu_pembayaran")));
  for (const order of menunggu) {
    if (!order.tagihanId) continue;
    const tagihan = await deps.billing.tagihanBerlaku(order.tagihanId);
    if (!tagihan) continue;
    if (tagihan.status === "lunas") {
      await deps.db.transaction(async (tx) => {
        const moved = await tx
          .update(pengurusanTpu)
          .set({ status: "diproses", lunasPada: now })
          .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "menunggu_pembayaran")))
          .returning({ id: pengurusanTpu.id });
        if (moved.length === 0) return;
        const tugas = await buatTugasSistem(
          { db: tx },
          {
            type: "ambil_surat_pengantar",
            subject: `Surat pengantar ${order.tpuName} · ${order.nomor}`,
            address: `${order.tpuName}, ${order.tpuAddress}`,
            plannedDate: wibDateOf(now),
          },
          now,
        );
        await tx.update(pengurusanTpu).set({ suratPengantarTugasId: tugas.id }).where(eq(pengurusanTpu.id, order.id));
      });
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
    return kembalikanKePerbaikan(deps, by, order, { aksi: "pengurusan.ptsp_perbaikan", alasan: input.alasan, dokumen: input.dokumen });
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

/**
 * Sends an order back to Perlu Perbaikan with the checklist documents to upload again and the reason: the cleared files
 * are forgotten (a failed delete after the commit leaves only an orphan blob) and the Tagihan, if any, is untouched.
 * Shared by the PTSP's fixable rejection (from IPTM Diajukan) and Admin Platform's own check before payment (from Diajukan).
 */
export async function kembalikanKePerbaikan(
  deps: PengurusanDeps,
  by: Actor,
  order: Row,
  perbaikan: { aksi: "pengurusan.ptsp_perbaikan" | "pengurusan.perbaikan_diminta"; alasan: string; dokumen: string[] },
): Promise<{ ok: true; status: "perlu_perbaikan" } | { ok: false; reason: "status_tidak_sesuai" | "dokumen_tidak_dikenal" }> {
  const now = deps.clock.now();
  const dikenal = new Set(order.dokumenPengajuan.map((dokumen) => dokumen.nama));
  if (!perbaikan.dokumen.every((nama) => dikenal.has(nama))) return { ok: false, reason: "dokumen_tidak_dikenal" };
  const lama = Object.entries(order.dokumenDiunggah ?? {}).filter(([nama]) => perbaikan.dokumen.includes(nama));
  const sisa = Object.fromEntries(Object.entries(order.dokumenDiunggah ?? {}).filter(([nama]) => !perbaikan.dokumen.includes(nama)));
  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pengurusanTpu)
      .set({
        status: "perlu_perbaikan",
        alasan: perbaikan.alasan,
        perbaikan: { alasan: perbaikan.alasan, dokumen: perbaikan.dokumen, pada: now.toISOString() },
        dokumenDiunggah: sisa,
        berkasLengkapDiunggahPada: null,
      })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, order.status)))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "status_tidak_sesuai" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: perbaikan.aksi,
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: order.status },
      after: { status: "perlu_perbaikan", dokumen: perbaikan.dokumen },
      reason: perbaikan.alasan,
    });
    return { ok: true as const, status: "perlu_perbaikan" as const };
  });
  // Best effort, after the commit: the cleared files are no longer referenced, so a failed delete leaves only an orphan blob.
  if (hasil.ok) for (const [, berkas] of lama) await deps.files.delete(berkas.key).catch(() => undefined);
  return hasil;
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

/** Every filing-only or Perpanjangan TPU order with all its documents in and unchecked, oldest first. No actor: the caller checks `antrean.lihat`. */
export async function periksaBerkasTerbuka(deps: Pick<PengurusanDeps, "db" | "lokasi">): Promise<PeriksaBerkasTerbuka[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(ne(pengurusanTpu.kind, "saat_duka_tpu"), inArray(pengurusanTpu.status, ["dimakamkan", "diajukan", "perlu_perbaikan"])));
  // A Perpanjangan TPU past the masa tenggang is not checked until the TPU has been asked (its own Tier 3 row).
  const siap = rows.filter((row) => menungguPemeriksaan(row) && row.berkasLengkapDiunggahPada !== null && (!row.lewatMasaTenggang || row.cekTpuSelesaiPada !== null));
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
}

/** Every Diproses filing-only order, oldest first. No actor: the caller checks `antrean.lihat`. */
export async function pengajuanBerkasTerbuka(deps: Pick<PengurusanDeps, "db" | "lokasi">): Promise<PengajuanBerkasTerbuka[]> {
  const rows = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "pengurusan_iptm"), eq(pengurusanTpu.status, "diproses")));
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
      })),
  );
  return hasil.sort((a, b) => a.lunasPada.getTime() - b.lunasPada.getTime());
}
