/**
 * Layanan added at a booking checkout (spec, Layanan > Order; ticket 53): the
 * items a Saat Duka, a Terencana or a Perpanjangan checkout may put on its own
 * Tagihan, what they cost there, and the Pekerjaan Layanan that become of them.
 *
 * Each checkout offers a different slice of the one catalog:
 *
 * - a **Saat Duka** checkout offers only the Layanan flagged "bisa hari-H" (a
 *   bunch of flowers for the burial day), priced on the same pay-after Tagihan;
 * - a **Terencana** checkout for a single plot offers only the Layanan flagged
 *   "ada di petak kosong" (cleaning, grass care, a photo report);
 * - a **Perpanjangan** checkout offers the Lokasi's whole offering, and its
 *   Layanan lines take the Perpanjangan's own due date — their target dates are
 *   constrained instead: each must be at least its lead time after that due date,
 *   so adding Layanan never shortens or endangers the Perpanjangan.
 *
 * **One Biaya Layanan Platform per Tagihan.** Tariffs' `quote()` adds that fee
 * once to any set of Lokasi Mitra lines; a checkout already carries its own, so
 * `barisCheckout` returns the Layanan lines **without** the fee line (it prices
 * the items, then drops the `biaya_layanan_platform` the quote appended). That is
 * the whole reason the fee is stripped here and not left to the caller to notice.
 *
 * The jobs are written through ticket 50's own order machinery
 * (`tulisPesananLayanan` + `jadwalkan`), so a checkout's Layanan are fulfilled,
 * cancelled and paid out exactly like a standalone one: this file only decides
 * which items a checkout may hold and turns them into that order.
 */
import type { Database } from "@/db/client";
import type { NewTagihanLine } from "@/domain/billing";
import { hargaLayananPartLabel } from "@/lib/layanan-labels";
import { itemCheckoutListSchema, type CheckoutJenis } from "./checkout-skema";
import type { LayananDeps } from "./deps";
import { penawaranUntukPesanan, offeringsUntukOrder, type LayananUntukPesanan, type VarianUntukOrder } from "./harga";
import { jadwalkan } from "./pembayaran";
import { targetPalingDini, tulisPesananLayanan } from "./pesanan";

export type { CheckoutJenis, ItemCheckout } from "./checkout-skema";
export { itemCheckoutListSchema, itemCheckoutSchema } from "./checkout-skema";

/** One item a checkout picked: the variant, its target date and the text the Layanan asks for. */

/** Why a set of checkout items cannot be priced or puts a Layanan where it may not go. */
export type BarisCheckoutRefusal =
  | "input_tidak_valid"
  /** A variant this Lokasi Mitra does not offer, or one its checkout kind does not offer. */
  | "layanan_tidak_tersedia"
  /** A target date inside that Layanan's minimum lead time (or, for a Perpanjangan, inside it after the Tagihan's due date). */
  | "lead_time_melewati"
  /** A Layanan that asks for a text field, left empty. */
  | "teks_kosong"
  /** The item could not be priced (no tariff in force). */
  | "harga_tidak_tersedia";

/** One priced Layanan of a checkout, as its Tagihan line and its job carry it. */
export interface BarisCheckout {
  layananId: string;
  layananVariantId: string;
  label: string;
  amount: number;
  leadTimeDays: number;
  targetDate: string;
  teks: string | null;
}

export type BarisCheckoutResult =
  | { ok: true; baris: BarisCheckout[]; lines: NewTagihanLine[]; total: number }
  | { ok: false; reason: BarisCheckoutRefusal };

/**
 * The Layanan a checkout of this `jenis` offers at a Lokasi Mitra, in catalog
 * order, each variant at that place's own price: the one read the checkout screen
 * takes. `perpanjangan` offers everything the Lokasi offers; `saat_duka` and
 * `terencana` narrow it to the catalog flags those checkouts are about.
 */
export async function penawaranCheckout(deps: LayananDeps, lokasiId: string, jenis: CheckoutJenis, at: Date): Promise<LayananUntukPesanan[]> {
  const semua = await penawaranUntukPesanan(deps, lokasiId, at);
  return semua.filter((grup) => bolehUntukCheckout(jenis, grup.layanan.bisaHariH, grup.layanan.adaDiPetakKosong));
}

/** Whether a Layanan's own flags let a checkout of this kind offer it. */
function bolehUntukCheckout(jenis: CheckoutJenis, bisaHariH: boolean, adaDiPetakKosong: boolean): boolean {
  switch (jenis) {
    case "saat_duka":
      return bisaHariH;
    case "terencana":
      return adaDiPetakKosong;
    case "perpanjangan":
      return true;
  }
}

/**
 * Prices and checks the items a checkout picked, or says why they cannot be
 * offered. Only a variant the Lokasi offers and the checkout kind allows may be
 * added; a target date must clear the Layanan's lead time from the checkout's own
 * clock, and for a Perpanjangan (`dueAt`) from that Tagihan's due date instead,
 * so the Layanan never pulls the Perpanjangan's due date earlier; a Layanan that
 * asks for text must carry it.
 *
 * The returned lines are the Tagihan's own `layanan` lines, **with no platform
 * fee**: the checkout's Tagihan already carries the one fee the rule allows.
 */
export async function barisCheckout(
  deps: LayananDeps,
  lokasi: { id: string; name: string },
  jenis: CheckoutJenis,
  rawItems: unknown,
  options: { now?: Date; dueAt?: Date } = {},
): Promise<BarisCheckoutResult> {
  const parsed = itemCheckoutListSchema.safeParse(rawItems);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const items = parsed.data;
  if (items.length === 0) return { ok: true, baris: [], lines: [], total: 0 };

  const now = options.now ?? deps.clock.now();
  const [diizinkan, tersedia] = await Promise.all([penawaranCheckout(deps, lokasi.id, jenis, now), offeringsUntukOrder(deps, lokasi.id, now)]);
  const varianDiizinkan = new Set(diizinkan.flatMap((grup) => grup.varian.map((varian) => varian.id)));

  const dipilih: { varian: VarianUntukOrder; targetDate: string; teks: string | null }[] = [];
  for (const satu of items) {
    const varian = tersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
    if (!varian || !varianDiizinkan.has(varian.id)) return { ok: false, reason: "layanan_tidak_tersedia" };
    const palingDini = targetPalingDini(varian.leadTimeDays, options.dueAt ?? now);
    if (satu.targetDate < palingDini) return { ok: false, reason: "lead_time_melewati" };
    const mauTeks = (varian.teksLabel ?? "") !== "";
    const teks = satu.teks?.trim() || null;
    if (mauTeks && teks === null) return { ok: false, reason: "teks_kosong" };
    dipilih.push({ varian, targetDate: satu.targetDate, teks: mauTeks ? teks : null });
  }

  const quoted = await deps.tariffs.quote(
    dipilih.map((satu) => ({ kind: "layanan_lokasi" as const, lokasiId: lokasi.id, layananVariantId: satu.varian.id })),
    now,
  );
  if (!quoted.ok) return { ok: false, reason: "harga_tidak_tersedia" };

  const baris: BarisCheckout[] = [];
  const lines: NewTagihanLine[] = [];
  for (const line of quoted.lines) {
    // The quote appended the one Biaya Layanan Platform a Lokasi Mitra set carries; the
    // checkout's own Tagihan already has it, so it is dropped here, never sent onward.
    if (line.kind === "biaya_layanan_platform") continue;
    if (line.kind !== "layanan_lokasi") return { ok: false, reason: "harga_tidak_tersedia" };
    const satu = dipilih[baris.length];
    if (!satu) return { ok: false, reason: "harga_tidak_tersedia" };
    const label = hargaLayananPartLabel(line, satu.varian);
    baris.push({
      layananId: satu.varian.layananId,
      layananVariantId: satu.varian.id,
      label,
      amount: line.amount,
      leadTimeDays: satu.varian.leadTimeDays,
      targetDate: satu.targetDate,
      teks: satu.teks,
    });
    lines.push({
      kind: "layanan",
      label,
      amount: line.amount,
      provider: { kind: "lokasi_mitra", lokasiId: lokasi.id, name: lokasi.name },
      targetDate: satu.targetDate,
      leadTimeDays: satu.varian.leadTimeDays,
    });
  }
  if (baris.length !== dipilih.length) return { ok: false, reason: "harga_tidak_tersedia" };
  return { ok: true, baris, lines, total: baris.reduce((jumlah, satu) => jumlah + satu.amount, 0) };
}

/** What a checkout hands over when its Layanan become an order: the grave, the family and the priced items. */
export interface JadwalkanCheckoutInput {
  pemesan: { accountId: string; name: string; email: string; phoneNumber: string };
  lokasi: { id: string; name: string };
  petak: { id: string; nomor: string };
  hakPakaiId: string;
  /** The checkout's own Tagihan: the Layanan are billed on it, and no second one is issued. */
  tagihanId: string;
  /** The WIB date the Tagihan was issued at: the moment the jobs are written. */
  createdAt: Date;
  /** The already-priced items `barisCheckout` returned. */
  baris: readonly BarisCheckout[];
}

export type JadwalkanCheckoutResult =
  | { ok: true; pesananLayananId: string; nomor: string; dijadwalkan: number; tertunda: number }
  | { ok: false; reason: "tanpa_item" | "tidak_ditemukan" };

/**
 * Writes the Layanan of a checkout the checkout has already issued its Tagihan
 * for: one order, its items and one Pekerjaan Layanan each, Dijadwalkan at once
 * because a checkout's Layanan are paid for by that Tagihan (a Saat Duka's
 * pay-after one included — the spec schedules its hari-H jobs at the confirmation,
 * never waiting for the money). Runs inside the checkout's own transaction
 * (`within`), so the Tagihan, the order and its jobs commit together.
 *
 * A grave whose Hak Pakai is still flagged Perlu Verifikasi holds its jobs as
 * Menunggu Pembayaran instead, and the ticket 50 tick releases them once the Admin
 * Lokasi completes the right: the same gate a standalone order's jobs meet.
 */
export async function jadwalkanCheckout(deps: LayananDeps, within: Database, input: JadwalkanCheckoutInput): Promise<JadwalkanCheckoutResult> {
  if (input.baris.length === 0) return { ok: false, reason: "tanpa_item" };
  const nomor = await deps.billing.within(within).nextNomorPemesanan();
  const order = await tulisPesananLayanan(
    within,
    {
      nomor,
      lokasiId: input.lokasi.id,
      petakId: input.petak.id,
      hakPakaiId: input.hakPakaiId,
      lokasiName: input.lokasi.name,
      petakNomor: input.petak.nomor,
      pemesanName: input.pemesan.name,
      pemesanPhone: input.pemesan.phoneNumber,
      pemesanEmail: input.pemesan.email,
      pemesanAccountId: input.pemesan.accountId,
      tagihanId: input.tagihanId,
      total: input.baris.reduce((jumlah, satu) => jumlah + satu.amount, 0),
      createdAt: input.createdAt,
    },
    input.baris.map((satu) => ({
      varian: { id: satu.layananVariantId, layananId: satu.layananId, leadTimeDays: satu.leadTimeDays },
      label: satu.label,
      amount: satu.amount,
      targetDate: satu.targetDate,
      teks: satu.teks,
    })),
  );
  // The payment already happened as part of the checkout, so the jobs are scheduled now,
  // through ticket 50's own `jadwalkan` (which also records the order as Terbayar) — the
  // Hak Pakai gate is honoured there, and the release tick is the same one a standalone
  // order's held job waits for.
  const hasil = await jadwalkan(within, { db: within, inventory: deps.inventory }, order.id, input.createdAt);
  if (!hasil.ok) return { ok: false, reason: "tidak_ditemukan" };
  return {
    ok: true,
    pesananLayananId: order.id,
    nomor,
    dijadwalkan: hasil.dijadwalkan,
    tertunda: hasil.tertunda,
  };
}
