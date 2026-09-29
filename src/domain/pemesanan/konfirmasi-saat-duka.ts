/**
 * Confirming a Pemesanan Saat Duka (spec, Pemesanan > Saat Duka: "Confirm =
 * assign a cleared Tersedia Petak of the chosen Jenis Makam → Hak Pakai Aktif →
 * pay-after Tagihan"; ticket 23). One step for the Admin Lokasi, and the whole
 * of it in one transaction: the order becomes Dikonfirmasi with the plot and the
 * agreed burial, the Hak Pakai exists for the Pemegang Hak the order recorded,
 * and the pay-after Tagihan is issued and due at the burial plus the Lokasi's
 * own Saat Duka payment window.
 *
 * Only that Lokasi's Admin Lokasi may confirm. Admin Platform may chase the
 * Lokasi by phone (its Tier 1 "Konfirmasi Lokasi terlambat" row) but never
 * confirm for it, and documents never gate this: a family may bring its papers
 * on the day.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { quoteLineLabel } from "@/lib/quote-line-label";
import { wib } from "@/lib/time/jakarta";
import type { NewTagihanLine, Tagihan } from "@/domain/billing";
import type { QuotedLine } from "@/domain/tariffs";
import type { PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** What the Admin Lokasi's confirm form sends. */
export const konfirmasiSaatDukaSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The cleared Tersedia Petak Makam of the chosen Jenis Makam it assigns. */
  petakId: z.uuid(),
  /** The burial the Lokasi agrees with the family, as `datetime-local` holds it: "YYYY-MM-DDTHH:mm" in WIB. */
  pemakamanAt: z.string().trim().min(1).max(40),
});
export type KonfirmasiSaatDukaInput = z.infer<typeof konfirmasiSaatDukaSchema>;

export type KonfirmasiSaatDukaResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "dikonfirmasi"; petakNomor: string; hakPakaiId: string };
      tagihan: { nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"] };
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The order is already Dikonfirmasi: its plot and its Tagihan stand. */
  | { ok: false; reason: "pesanan_sudah_dikonfirmasi" }
  /** The order has ended (Ditolak, Dibatalkan): there is nothing to confirm. */
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** The chosen Petak is not a cleared Tersedia Petak of the order's Jenis Makam at that Lokasi (or is already held). */
  | { ok: false; reason: "petak_tidak_ditemukan" | "petak_belum_tersedia" | "jenis_makam_beda" }
  /** Neither the Pemesan nor the Pemegang Hak left a number the Tagihan can be addressed to. */
  | { ok: false; reason: "kontak_pemesan_kosong" }
  /** The order's Jenis Makam can no longer be priced (or the total is above the QRIS cap). */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** The Lokasi Mitra is not there any more, so its payment window cannot be read. */
  | { ok: false; reason: "lokasi_tidak_terbuka" }
  /** An order always has a Pemegang Hak, so this never happens in practice. */
  | { ok: false; reason: "pemegang_hak_kosong" }
  /** A Tagihan could not be issued (no Pengaturan Operator, a total past a cap): nothing at all is written. */
  | { ok: false; reason: "tagihan_tidak_terbit" };

/**
 * Confirms one Diajukan order: the Petak, the Hak Pakai, the Tagihan and the
 * order's new status, in one transaction, so a failure anywhere leaves the order
 * exactly as it was and its plot free.
 */
export async function konfirmasiSaatDuka(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<KonfirmasiSaatDukaResult> {
  const parsed = konfirmasiSaatDukaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  // The order names the Lokasi whose orders this is, so the check can be made
  // against that Lokasi (a read, never a write).
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status === "dikonfirmasi") return { ok: false, reason: "pesanan_sudah_dikonfirmasi" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };
  if (!order.jenisMakamId) return { ok: false, reason: "jenis_makam_beda" };

  const now = deps.clock.now();
  const pemakamanAt = wib(input.pemakamanAt);
  const phoneNumber = order.pemegangHak.phoneNumber ?? order.phoneNumber;
  if (!phoneNumber) return { ok: false, reason: "kontak_pemesan_kosong" };
  const paymentWindowHours = await deps.lokasi.saatDukaPaymentWindowHours(order.lokasiId);
  if (paymentWindowHours === null) return { ok: false, reason: "lokasi_tidak_terbuka" };
  const harga = await deps.tariffs.quote(
    [
      { kind: "harga_hak_pakai", jenisMakamId: order.jenisMakamId },
      { kind: "biaya_pemakaman", lokasiId: order.lokasiId, tumpang: false },
    ],
    now,
  );
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };

  const holder = order.pemegangHak;
  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const hakPakai = await deps.inventory.within(tx).beriHakPakai(by, order.lokasiId, {
      petakId: input.petakId,
      jenisMakamId: order.jenisMakamId!,
      pemegangHak: { name: holder.name, phoneNumber, email: holder.email ?? undefined },
    });
    if (!hakPakai.ok) return hakPakai;

    const baris = linesOf(harga.lines, order);
    if (!baris.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "saat_duka", burialAt: pemakamanAt, paymentWindowHours },
      addressee: { name: order.pemesanName, phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.lokasiName,
      lines: baris.lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    // The Tagihan is announced in the same transaction that issues it: this is
    // what records where its messages go, so its email, reminders and receipt
    // all find an address (an order with no email opens a Telepon Pemesan row).
    const diumumkan = await deps.notifikasi.tagihanTerbit(tx, {
      tagihanId: tagihan.tagihan.id,
      momentKind: "saat_duka",
      nomorTagihan: tagihan.tagihan.nomorTagihan,
      nomorPemesanan: order.nomor,
      email: order.email,
      perihal: `Pemakaman dan Hak Pakai Makam di ${order.lokasiName}`,
      total: tagihan.tagihan.total,
      dueAt: tagihan.tagihan.dueAt,
      link: tagihan.tagihan.link,
    });
    if (!diumumkan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    const moved = await tx
      .update(pemesananMakam)
      .set({
        status: "dikonfirmasi",
        petakId: input.petakId,
        petakNomor: hakPakai.nomor,
        hakPakaiId: hakPakai.hakPakaiId,
        pemakamanAt,
        dikonfirmasiPada: now,
        tagihanId: tagihan.tagihan.id,
      })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.status, "diajukan")))
      .returning({ id: pemesananMakam.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_dikonfirmasi" as const };

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.konfirmasi_saat_duka",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", petakId: null, tagihanId: null },
      after: {
        status: "dikonfirmasi",
        petak: hakPakai.nomor,
        hakPakaiId: hakPakai.hakPakaiId,
        pemakamanAt: pemakamanAt.toISOString(),
        nomorTagihan: tagihan.tagihan.nomorTagihan,
      },
      reason: null,
    });
    return {
      ok: true as const,
      pesanan: { nomor: order.nomor, status: "dikonfirmasi" as const, petakNomor: hakPakai.nomor, hakPakaiId: hakPakai.hakPakaiId },
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        kind: tagihan.tagihan.kind,
        link: tagihan.tagihan.link,
      },
    };
  });
  if (!hasil.ok) return hasil;

  // The Lokasi's own record gives the family the contact and the checklist to
  // bring; the confirmation is already written when this cannot be read.
  const lokasi = await deps.lokasi.lokasiMitra(by, order.lokasiId);
  await deps.notifikasi.pesananDikonfirmasi({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    jenisMakamName: order.jenisMakamName,
    almarhum: { name: order.almarhumName, tanggalWafat: order.tanggalWafat },
    pemakamanAt,
    petak: { nomor: hasil.pesanan.petakNomor },
    kontakLokasi: {
      name: (await deps.lokasi.kontakSiagaOf(order.lokasiId))?.name || (lokasi.ok ? lokasi.lokasiMitra.pengelolaName : order.lokasiName),
      phoneNumber: (await deps.lokasi.kontakSiagaOf(order.lokasiId))?.phoneNumber ?? null,
    },
    dokumen: lokasi.ok ? lokasi.lokasiMitra.documentChecklist : [],
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
 * The Tagihan lines a Saat Duka confirmation issues: the quote's own lines with
 * the wording a Tagihan keeps, the Lokasi Mitra named as it was at submission.
 * A Laptop fee (`biaya_layanan_platform`) is the Operator's, the rest the
 * Lokasi's.
 *
 * The kinds are matched by name rather than passed through, and a kind this flow
 * cannot issue is a **refusal**, never a silent omission. Ticket 49 widened the
 * quote's line kinds (a Layanan price at a Lokasi Mitra and at a TPU), and those
 * belong to a different order; a Saat Duka quote that ever carried one would
 * otherwise produce a Tagihan missing a line, which under-charges the family —
 * and the only thing standing between that and a real invoice would be the
 * compiler, which a future widening could satisfy by widening this file too.
 */
/** The line kinds a Saat Duka confirmation may put on a Tagihan. Anything else is refused. */
const KINDS_YANG_BISA_DITAGIH = [
  "harga_hak_pakai",
  "biaya_pemakaman",
  "perpanjangan",
  "biaya_pengurusan",
  "retribusi_pemda",
  "biaya_layanan_platform",
] as const;

function linesOf(
  quoted: readonly QuotedLine[],
  order: { lokasiId: string; lokasiName: string },
): { ok: true; lines: NewTagihanLine[] } | { ok: false; reason: "baris_tidak_bisa_ditagih" } {
  const lines: NewTagihanLine[] = [];
  for (const line of quoted) {
    const kind = KINDS_YANG_BISA_DITAGIH.includes(line.kind as (typeof KINDS_YANG_BISA_DITAGIH)[number])
      ? (line.kind as (typeof KINDS_YANG_BISA_DITAGIH)[number])
      : null;
    if (kind === null) return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    lines.push({
      kind,
      label: quoteLineLabel(line),
      amount: line.amount,
      provider:
        line.provider.kind === "lokasi_mitra"
          ? { kind: "lokasi_mitra", lokasiId: order.lokasiId, name: order.lokasiName }
          : line.provider,
    });
  }
  return { ok: true, lines };
}
