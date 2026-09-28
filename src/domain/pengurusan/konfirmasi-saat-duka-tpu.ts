/**
 * The confirmation of a Saat Duka TPU order, and everything the family reads
 * once it is confirmed (spec, Pengurusan; stories 73 and 145; ticket 45).
 *
 * Confirming is one Admin Platform's one step, and the whole of it in one
 * transaction: the order becomes Dikonfirmasi with the burial time agreed with
 * the TPU, the pay-after Tagihan is issued (Biaya Pengurusan + Retribusi,
 * due 3×24 h after the burial, chased, the Operator bearing the loss), and an
 * "Ambil surat pengantar" Tugas Lapangan is created for the Petugas who fetches
 * the letter from the TPU. Anything that fails leaves the order exactly as it was.
 *
 * The two contacts the family needs are the Admin Platform who took the order
 * (their name and phone number, the number the family may call) and the TPU's
 * own office contact, which the Operator arranges the burial through; neither is
 * derived here.
 *
 * What it refuses, in order: an input that does not parse, a confirmation
 * without a PetugasLapangan to send the letter to, an order that is not a Saat
 * Duka TPU one, an order that has already moved on, a TPU that is no longer on
 * the list, a burial time that is not on the TPU window or is in the past, a
 * price that cannot be quoted now, an addressee with no reachable phone number,
 * and a Tagihan that will not issue.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withinPaymentCap, type LineProvider, type NewTagihanLine } from "@/domain/billing";
import { daytimeHoursDeadline, isOpenAt, TPU_SCHEDULE } from "@/domain/lokasi";
import type { Actor } from "@/domain/identity";
import { quoteLineLabel } from "@/lib/quote-line-label";
import type { QuotedLine } from "@/domain/tariffs";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import type { PengurusanDeps } from "./deps";
import { pengurusanTpu, type HargaBaris } from "./schema";
import { JAM_KONFIRMASI_TPU } from "./pilihan";

/** What Admin Platform's confirm form sends. */
export const konfirmasiSaatDukaTpuSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The burial agreed with the TPU, as `datetime-local` holds it: "YYYY-MM-DDTHH:mm" in WIB. */
  pemakamanAt: z.string().trim().min(1).max(40),
  /** The TPU office's own contact, the number the family may reach it at. */
  kontakTpu: z.object({
    name: z.string().trim().min(1).max(200),
    phoneNumber: z.string().trim().min(1).max(30),
  }),
  /** The Petugas Lapangan who fetches the surat pengantar from the TPU. */
  petugasAccountId: z.string().trim().min(1),
  /** Why the family should be told, in one line, shown on the confirmation. */
  catatan: z.string().trim().max(500).default(""),
});
export type KonfirmasiSaatDukaTpuInput = z.infer<typeof konfirmasiSaatDukaTpuSchema>;

/** How long a family has to pay after the burial: 3×24 h (spec, Billing due table). */
const JAM_TEMBAK_TPU = 72;

export type KonfirmasiSaatDukaTpuResult =
  | {
      ok: true;
      pengurusan: {
        nomor: string;
        status: "dikonfirmasi";
        pemakamanAt: Date;
        konfirmasiDueAt: Date | null;
        petugas: { name: string; phoneNumber: string | null };
      };
      tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; link: string };
    }
  | { ok: false; reason: "input_tidak_valid" }
  /** No Pengurusan order of that Nomor Pemesanan, or it is not a Saat Duka TPU one. */
  | { ok: false; reason: "pengurusan_tidak_ditemukan" }
  /** The order is no longer waiting for a confirmation (Dikonfirmasi, Ditolak, Dibatalkan). */
  | { ok: false; reason: "pengurusan_sudah_dikonfirmasi" }
  /** The TPU is off the list, or has stopped taking new plots, since the family applied. */
  | { ok: false; reason: "tpu_tidak_ada" | "tpu_tidak_menerima_makam_baru" }
  /** The agreed burial is not inside the TPU window (06:00–18:00 WIB) or is in the past. */
  | { ok: false; reason: "waktu_pemakaman_tidak_terbuka" }
  /** The chosen Akun holds no Petugas Lapangan role, so nobody could fetch the surat pengantar. */
  | { ok: false; reason: "bukan_petugas_lapangan" }
  /** Neither the Pemesan nor the Pemegang Hak left a number the Tagihan can be addressed to. */
  | { ok: false; reason: "kontak_pemesan_kosong" }
  /** The TPU price can no longer be quoted, or its total is above the QRIS cap. */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** A Tagihan could not be issued (no Pengaturan Operator, a total past a cap): nothing at all is written. */
  | { ok: false; reason: "tagihan_tidak_terbit" };

/** The price lines a Saat Duka TPU Tagihan carries, as the confirmation shows them. */
const burialLines = [
  { kind: "biaya_pengurusan", pengurusan: "pemakaman" },
  { kind: "retribusi_pemda", retribusi: "iptm" },
] as const;

/**
 * The line kinds this flow may put on a Tagihan. Anything else in the quote is a
 * **refusal**, never a silent omission: a quote that carried a line this order
 * cannot charge would produce a Tagihan missing it, and under-charging the
 * family is exactly what the check exists to prevent.
 */
const KINDS_YANG_BISA_DITAGIH = ["biaya_pengurusan", "retribusi_pemda", "biaya_layanan_platform"] as const;

/**
 * Confirms one Diajukan Saat Duka TPU order: the status, the agreed burial, the
 * pay-after Tagihan, the Admin Platform who took it and the Petugas who fetches
 * the surat pengantar, in one transaction, so a failure anywhere leaves the order
 * exactly as it was and no Tagihan numbered.
 *
 * The Tugas Lapangan is created through the Field Work module's own public
 * function, and the family message after the transaction commits: a push that
 * goes out for a rolled-back order is worse than one that arrives a moment late.
 */
export async function konfirmasiSaatDukaTpu(
  deps: PengurusanDeps,
  by: Actor,
  rawInput: unknown,
): Promise<KonfirmasiSaatDukaTpuResult> {
  const parsed = konfirmasiSaatDukaTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, input.nomor));
  if (!order || order.kind !== "saat_duka_tpu") return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status !== "diajukan") return { ok: false, reason: "pengurusan_sudah_dikonfirmasi" };

  const tpu = await deps.lokasi.publicTpuDki(order.tpuId);
  if (!tpu) return { ok: false, reason: "tpu_tidak_ada" };
  if (!tpu.newPlot) return { ok: false, reason: "tpu_tidak_menerima_makam_baru" };

  const now = deps.clock.now();
  const pemakamanAt = wib(input.pemakamanAt);
  // The burial is arranged with the TPU inside its own window, so an agreed
  // time outside it is a typo rather than an agreement: refused, never stored.
  if (pemakamanAt.getTime() < now.getTime() || !isOpenAt(TPU_SCHEDULE, pemakamanAt)) {
    return { ok: false, reason: "waktu_pemakaman_tidak_terbuka" };
  }

  const petugas = (await deps.identity.staffAccounts()).find((account) => account.accountId === input.petugasAccountId);
  if (!petugas || petugas.deactivated || !petugas.roles.includes("petugas_lapangan")) {
    return { ok: false, reason: "bukan_petugas_lapangan" };
  }

  const phoneNumber = order.pemegangHak.phoneNumber ?? order.phoneNumber;
  if (!phoneNumber) return { ok: false, reason: "kontak_pemesan_kosong" };

  const quoted = await deps.tariffs.quote(burialLines, now);
  if (!quoted.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const lines = barisTagihan(quoted.lines);
  if (!lines.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  if (!withinPaymentCap(lines.total)) return { ok: false, reason: "harga_tidak_tersedia" };

  const konfirmasiDueAt = order.konfirmasiDueAt;
  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const tagihan = await deps.billing.within(tx).issueTagihan({
      // Pay-after, due 3×24 h after the burial: a family's payment never holds
      // up a burial that has already happened, and chasing a later Tagihan
      // (ticket 29) is the Operator's own loss to carry.
      moment: { kind: "saat_duka", burialAt: pemakamanAt, paymentWindowHours: JAM_TEMBAK_TPU },
      addressee: { name: order.pemesanName, phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.tpuName,
      lines: lines.lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    // The condition on the update is the module's own guard against two
    // confirmations at once: whichever loses finds no row to move and the
    // whole transaction rolls back, Tagihan number included.
    const moved = await tx
      .update(pengurusanTpu)
      .set({
        status: "dikonfirmasi",
        pemakamanAt,
        dikonfirmasiPada: now,
        tagihanId: tagihan.tagihan.id,
        tagihanNomor: tagihan.tagihan.nomorTagihan,
        harga: lines.harga,
        adminPlatformAccountId: by.accountId,
        adminPlatformName: by.email,
        adminPlatformPhoneNumber: by.phoneNumber,
        kontakTpu: input.kontakTpu,
        catatanKonfirmasi: input.catatan === "" ? null : input.catatan,
      })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "diajukan")))
      .returning({ id: pengurusanTpu.id });
    if (moved.length === 0) return { ok: false as const, reason: "pengurusan_sudah_dikonfirmasi" as const };

    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengurusan.konfirmasi_saat_duka_tpu",
      entity: { kind: "pengurusan_tpu", id: order.id },
      lokasiId: null,
      before: { status: "diajukan", tagihanId: null },
      after: {
        status: "dikonfirmasi",
        pemakamanAt: pemakamanAt.toISOString(),
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        tpu: tpu.name,
        petugasAccountId: petugas.accountId,
      },
      reason: null,
    });

    // The surat pengantar is fetched by a Petugas from the TPU, on the burial
    // day: it is the letter the filing needs and the family never carries it.
    const tugas = await deps.fieldwork.within(tx).createTugasLapangan(by, {
      type: "ambil_surat_pengantar",
      subject: `Surat pengantar ${tpu.name} · ${order.nomor}`,
      lokasiId: null,
      address: `${tpu.name}, ${tpu.address}`,
      pin: tpu.pin,
      plannedDate: wibDateOf(pemakamanAt),
      assigneeAccountId: petugas.accountId,
    });
    if (!tugas.ok) return { ok: false as const, reason: "bukan_petugas_lapangan" as const };

    return {
      ok: true as const,
      pengurusan: {
        nomor: order.nomor,
        status: "dikonfirmasi" as const,
        pemakamanAt,
        konfirmasiDueAt,
        petugas: { name: petugas.email ?? petugas.accountId, phoneNumber: petugas.phoneNumber },
      },
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
    };
  });
  if (!hasil.ok) return hasil;

  // The family is told once the confirmation has committed: the agreed burial,
  // both contacts, both document lists, the price lines and the Tagihan.
  await deps.notifikasi.pengurusanDikonfirmasi({
    pengurusanId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    tpu: { name: order.tpuName, address: order.tpuAddress },
    almarhum: { name: order.almarhumName, tanggalWafat: order.tanggalWafat },
    pemakamanAt,
    adminPlatform: { name: by.email, phoneNumber: by.phoneNumber },
    kontakTpu: input.kontakTpu,
    catatan: input.catatan === "" ? null : input.catatan,
    dokumen: { pemakaman: order.dokumenPemakaman, pengajuan: order.dokumenPengajuan },
    harga: lines.harga,
    tagihan: {
      nomorTagihan: hasil.tagihan.nomorTagihan,
      total: hasil.tagihan.total,
      dueAt: hasil.tagihan.dueAt,
      link: hasil.tagihan.link,
    },
  });

  return hasil;
}

/**
 * The quote's own lines as a Tagihan carries them, with the wording it keeps
 * and the total it will show. A line this flow cannot charge refuses the whole
 * confirmation rather than being dropped from it.
 */
function barisTagihan(
  quoted: readonly QuotedLine[],
): { ok: true; lines: NewTagihanLine[]; harga: HargaBaris[]; total: number } | { ok: false; reason: "baris_tidak_bisa_ditagih" } {
  const lines: NewTagihanLine[] = [];
  const harga: HargaBaris[] = [];
  let total = 0;
  for (const line of quoted) {
    const kind = KINDS_YANG_BISA_DITAGIH.find((boleh) => boleh === line.kind);
    if (!kind) return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    const label = quoteLineLabel(line);
    total += line.amount;
    lines.push({ kind, label, amount: line.amount, provider: lineProviderOf(line) });
    // The same figure the Tagihan carries, kept on the order so the family's
    // confirmation quotes what was billed rather than a second, drifting price.
    harga.push({ kind, label, amount: line.amount });
  }
  return { ok: true, lines, harga, total };
}

/**
 * A TPU order's line provider as a Tagihan records it. A TPU price is the
 * Operator's own fee or the town's, never a Lokasi Mitra's, so a quote that
 * named one here would be a price this flow cannot charge and is refused by the
 * kind check above.
 */
function lineProviderOf(line: QuotedLine): LineProvider {
  if (line.provider.kind === "pemda") return { kind: "pemda" };
  return { kind: "operator" };
}

/** The instant a Saat Duka TPU submission is confirmed by, on the TPU window. */
export function batasKonfirmasiTpu(at: Date): Date {
  return daytimeHoursDeadline(at, JAM_KONFIRMASI_TPU);
}
