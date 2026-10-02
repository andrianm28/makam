/**
 * The direct path of a Perpanjangan (spec, domain module 7; ticket 40): whether
 * one is open, the terms a family may choose with their price, the proof that
 * the person asking is the Pemegang Hak (a code to the email recorded on the
 * Hak Pakai, skipped for the Akun that holds that Email Terverifikasi), and the
 * pay-first Tagihan addressed to the Pemegang Hak.
 *
 * Nothing here moves the Hak Pakai: that happens when the Tagihan is paid
 * (`./efek.ts`), because the payment is what a Perpanjangan is.
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { refusable } from "@/db/unit-of-work";
import { tagihanDue, withinPaymentCap, type IssueRefusal, type NewTagihanLine, type Tagihan } from "@/domain/billing";
import { itemCheckoutListSchema } from "@/domain/layanan/pesanan-schema";
import { normaliseEmail } from "@/domain/identity";
import { addYears } from "@/domain/inventory";
import type { QuotedLine } from "@/domain/tariffs";
import { quoteLineLabel } from "@/lib/quote-line-label";
import { wibDateOf } from "@/lib/time/jakarta";
import { bolehDiperpanjang, samarkanEmail, type CatatanPerpanjangan } from "./aturan";
import type { PerpanjanganDeps } from "./deps";
import { perpanjangan } from "./schema";

/** The Pemegang Hak's way to prove itself, as the page shows it. */
export type JalurBukti =
  /** The Akun is signed in with the Email Terverifikasi recorded on the Hak Pakai: no code. */
  | "sudah_masuk"
  /** A code goes to the email recorded on the Hak Pakai. */
  | "kode_email"
  /** No email is recorded: the manual paths (KTP, heir, claim) apply. */
  | "tanpa_email";

/** An open Perpanjangan of the Hak Pakai still waiting for its money. */
export interface TagihanTerbuka {
  perpanjanganId: string;
  terms: number;
  nomorTagihan: string;
  link: string;
  dueAt: Date;
}

export type StatusPerpanjangan =
  | {
      boleh: true;
      hakPakaiId: string;
      lokasiName: string;
      petakNomor: string;
      /** The end date on record, and the term length one Perpanjangan adds. */
      endDate: string;
      tenureYears: number;
      /** K: the most terms one Perpanjangan may buy at this Lokasi. */
      maxTerms: number;
      dibukaSejak: string;
      masaTenggangBerakhir: string;
      jalur: JalurBukti;
      /** The recorded email, masked; null when none is recorded. */
      emailDisamarkan: string | null;
      /**
       * Set while an earlier Perpanjangan of this Hak Pakai still waits for its money, and only for
       * the Akun signed in with the recorded Email Terverifikasi: its number, due date and link are
       * the Pemegang Hak's business, and this status is reachable from an anonymous grave lookup.
       */
      tagihanTerbuka: TagihanTerbuka | null;
    }
  | { boleh: false; catatan: CatatanPerpanjangan };

/** Who is asking, when someone is signed in: the Akun and the Email Terverifikasi it holds. */
export interface Pemohon {
  accountId: string;
  email: string;
}

/** The facts of one Hak Pakai every step reads, or the note that stops it. */
export async function fakta(deps: PerpanjanganDeps, hakPakaiId: string) {
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  if (!hak) return { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const aturan = await deps.lokasi.aturanPerpanjanganOf(hak.lokasiId);
  if (!aturan) return { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const hariIni = wibDateOf(deps.clock.now());
  const boleh = bolehDiperpanjang(hak, hariIni, aturan.masaTenggangMonths);
  // A Hak Pakai that has ended or is perpetual has nothing to extend, whatever else is true of it.
  if (!boleh.boleh && tidakAdaYangDiperpanjang(boleh.catatan)) return { ok: false as const, catatan: boleh.catatan };
  // An overdue pay-after Tagihan on the Hak Pakai blocks until it is paid.
  const penghalang = await deps.pemesanan.tagihanPenghalangOf(hak.id);
  if (penghalang) return { ok: false as const, catatan: { kind: "lunasi_tagihan", nomorTagihan: penghalang.nomorTagihan, link: penghalang.link } satisfies CatatanPerpanjangan };
  if (!boleh.boleh) return { ok: false as const, catatan: boleh.catatan };
  return { ok: true as const, hak, aturan, jendela: boleh, hariIni };
}

/** Whether a note says the Hak Pakai has nothing to extend at all (perpetual, Berakhir or Dibatalkan): it wins over every other note. */
export function tidakAdaYangDiperpanjang(catatan: CatatanPerpanjangan): boolean {
  if (catatan.kind === "selamanya") return true;
  return catatan.kind === "hubungi_admin_lokasi" && (catatan.sebab === "berakhir" || catatan.sebab === "dibatalkan");
}

/** The Petak Makam, or the Kavling Keluarga with its Petak, as the family knows it. */
export function labelPetak(hak: { petakNomor: string[]; nomorKavling: string | null }): string {
  return hak.nomorKavling ? `Kavling ${hak.nomorKavling} (${hak.petakNomor.join(", ")})` : hak.petakNomor.join(", ");
}

/** The Perpanjangan of this Hak Pakai that still waits for its money, if there is one. */
export async function terbukaOf(deps: PerpanjanganDeps, hakPakaiId: string, now: Date): Promise<TagihanTerbuka | null> {
  const rows = await deps.db
    .select()
    .from(perpanjangan)
    .where(eq(perpanjangan.hakPakaiId, hakPakaiId))
    .orderBy(desc(perpanjangan.dibuatPada));
  for (const row of rows) {
    if (row.dibayarPada) continue;
    const tagihan = await deps.billing.tagihanBerlaku(row.tagihanId);
    if (tagihan && tagihan.status === "belum_dibayar" && tagihan.dueAt > now) {
      return { perpanjanganId: row.id, terms: row.terms, nomorTagihan: tagihan.nomorTagihan, link: tagihan.link, dueAt: tagihan.dueAt };
    }
  }
  return null;
}

/**
 * Whether a Perpanjangan is open for this Hak Pakai today, or the note that
 * replaces the button. `dengan` is the signed-in Akun, when there is one: an
 * Akun holding the recorded Email Terverifikasi skips the code. The recorded
 * email itself never leaves this module, only its masked form.
 */
export async function statusPerpanjangan(deps: PerpanjanganDeps, hakPakaiId: string, dengan?: Pemohon | null): Promise<StatusPerpanjangan> {
  const dasar = await fakta(deps, hakPakaiId);
  if (!dasar.ok) return { boleh: false, catatan: dasar.catatan };
  const { hak, aturan, jendela } = dasar;
  const tercatat = hak.pemegangHak?.email ? normaliseEmail(hak.pemegangHak.email) : null;
  const jalur: JalurBukti = !tercatat
    ? "tanpa_email"
    : dengan && normaliseEmail(dengan.email) === tercatat
      ? "sudah_masuk"
      : "kode_email";
  return {
    boleh: true,
    hakPakaiId: hak.id,
    lokasiName: aturan.name,
    petakNomor: labelPetak(hak),
    endDate: hak.endDate!,
    tenureYears: hak.tenureYears!,
    maxTerms: aturan.maxPerpanjanganTerms,
    dibukaSejak: jendela.dibukaSejak,
    masaTenggangBerakhir: jendela.masaTenggangBerakhir,
    jalur,
    emailDisamarkan: tercatat ? samarkanEmail(tercatat) : null,
    tagihanTerbuka: jalur === "sudah_masuk" ? await terbukaOf(deps, hak.id, deps.clock.now()) : null,
  };
}

/** One term choice: `terms` terms priced all-in, with the end date they lead to. */
export interface OpsiMasa {
  terms: number;
  total: number;
  /** The end date this choice leads to, counted from the end date on record. */
  endDateBaru: string;
  lines: { label: string; amount: number }[];
}

export type TawaranResult =
  | { ok: true; endDate: string; opsi: OpsiMasa[] }
  | { ok: false; reason: "tidak_boleh"; catatan: CatatanPerpanjangan }
  /** Nothing can be priced (no Perpanjangan price entered) or even one term passes the QRIS cap: the family is pointed to CS. */
  | { ok: false; reason: "harga_tidak_tersedia" };

/** Every choice of 1..K terms with its all-in price (Perpanjangan price x terms plus Biaya Layanan Platform, from `quote()`), within the payment cap. */
export async function tawaranPerpanjangan(deps: PerpanjanganDeps, hakPakaiId: string): Promise<TawaranResult> {
  const dasar = await fakta(deps, hakPakaiId);
  if (!dasar.ok) return { ok: false, reason: "tidak_boleh", catatan: dasar.catatan };
  const { hak, aturan } = dasar;
  if (!hak.jenisMakamId || hak.tenureYears === null || hak.endDate === null) return { ok: false, reason: "harga_tidak_tersedia" };
  const opsi: OpsiMasa[] = [];
  for (let terms = 1; terms <= aturan.maxPerpanjanganTerms; terms += 1) {
    const harga = await deps.tariffs.quote(
      [{ kind: "perpanjangan", jenisMakamId: hak.jenisMakamId, tenure: { kind: "tahun", years: hak.tenureYears }, terms }],
      deps.clock.now(),
    );
    // A dearer choice only costs more: once one is refused or over the cap, so is every later one.
    if (!harga.ok || !withinPaymentCap(harga.total)) break;
    opsi.push({
      terms,
      total: harga.total,
      endDateBaru: addYears(hak.endDate, terms * hak.tenureYears),
      lines: harga.lines.map((line) => ({ label: quoteLineLabel(line), amount: line.amount })),
    });
  }
  if (opsi.length === 0) return { ok: false, reason: "harga_tidak_tersedia" };
  return { ok: true, endDate: hak.endDate, opsi };
}

export const ajukanPerpanjanganSchema = z.object({
  hakPakaiId: z.uuid(),
  terms: z.number().int().min(1).max(100),
  pemohon: z.object({ accountId: z.string().trim().min(1).max(200), email: z.string().trim().min(1).max(320) }),
  /** The optional "Tambah Layanan" step: each item's variant, target date and text (ticket 53). */
  layanan: itemCheckoutListSchema.optional(),
});
export type AjukanPerpanjanganInput = z.infer<typeof ajukanPerpanjanganSchema>;

export type AjukanResult =
  | {
      ok: true;
      perpanjangan: {
        id: string;
        terms: number;
        tagihan: { nomorTagihan: string; total: number; dueAt: Date; link: string };
        /** The Nomor Pemesanan the added Layanan are ordered under; null when none were added. */
        layananNomor: string | null;
      };
    }
  | { ok: false; reason: "input_tidak_valid" | "harga_tidak_tersedia" | "kontak_pemegang_hak_kosong" | "tagihan_tidak_terbit" }
  /** The added Layanan: not offered here, a text left empty, a date missing, or a date less than its lead time after the due date. */
  | { ok: false; reason: "layanan_tidak_tersedia" | "teks_kosong" | "target_kosong" | "lead_time_melewati" }
  | { ok: false; reason: "tidak_boleh"; catatan: CatatanPerpanjangan }
  /** The asker is not the Pemegang Hak: the email is not the recorded one, or does not belong to that Akun. */
  | { ok: false; reason: "bukan_pemegang_hak" }
  | { ok: false; reason: "terms_melebihi_batas"; maxTerms: number }
  /** An earlier Perpanjangan of this Hak Pakai still waits for its money; its Tagihan is never changed, only paid or lapsed. */
  | { ok: false; reason: "tagihan_terbuka"; tagihanTerbuka: TagihanTerbuka }
  /** The Tagihan would pass the QRIS cap: v1 takes no such order, the family is pointed to CS. */
  | { ok: false; reason: "melebihi_batas_qris" };

/**
 * Orders a Perpanjangan of `terms` terms: issues the pay-first Tagihan (due
 * 3x24 h after issue) addressed to the Pemegang Hak and announces it. The caller
 * has proven who is asking (a Kode Masuk, or the session), and this checks that
 * the Akun's Email Terverifikasi is the one recorded on the Hak Pakai.
 *
 * Anyone may pay the Tagihan afterwards; paying grants no right.
 */
export async function ajukanPerpanjangan(deps: PerpanjanganDeps, rawInput: unknown): Promise<AjukanResult> {
  const parsed = ajukanPerpanjanganSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const now = deps.clock.now();

  const dasar = await fakta(deps, input.hakPakaiId);
  if (!dasar.ok) return { ok: false, reason: "tidak_boleh", catatan: dasar.catatan };
  const { hak, aturan } = dasar;

  const tercatat = hak.pemegangHak?.email ? normaliseEmail(hak.pemegangHak.email) : null;
  const email = normaliseEmail(input.pemohon.email);
  if (!tercatat || !email || email !== tercatat) return { ok: false, reason: "bukan_pemegang_hak" };
  const akun = await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== input.pemohon.accountId) return { ok: false, reason: "bukan_pemegang_hak" };

  return pesanTagihan(deps, { hak, aturan, akun, terms: input.terms, now, permohonanId: null, layanan: input.layanan });
}

/** The Hak Pakai and the Lokasi's rules a Perpanjangan is ordered on (what `fakta` returned). */
type DasarPesanan = Extract<Awaited<ReturnType<typeof fakta>>, { ok: true }>;

/**
 * The order step every path ends in (ticket 40's direct path, and ticket 41's approved manual
 * paths): terms within the Lokasi's K, the price from Tariffs, and the pay-first Tagihan addressed
 * to the Pemegang Hak on record, announced in the same transaction. The caller has already proven
 * who is asking; `permohonanId` names the approved request the order rests on, when there is one.
 */
export async function pesanTagihan(
  deps: PerpanjanganDeps,
  input: { hak: DasarPesanan["hak"]; aturan: DasarPesanan["aturan"]; akun: { id: string; email: string }; terms: number; now: Date; permohonanId: string | null; layanan?: unknown[] },
): Promise<AjukanResult> {
  const { hak, aturan, akun, now } = input;
  if (input.terms > aturan.maxPerpanjanganTerms) return { ok: false, reason: "terms_melebihi_batas", maxTerms: aturan.maxPerpanjanganTerms };
  const nama = hak.pemegangHak?.name;
  const telepon = hak.pemegangHak?.phoneNumber;
  if (!nama || !telepon) return { ok: false, reason: "kontak_pemegang_hak_kosong" };
  if (!hak.jenisMakamId || hak.tenureYears === null) return { ok: false, reason: "harga_tidak_tersedia" };

  // The Tagihan keeps the Perpanjangan's due date (3x24 h), so each added Layanan's date must be its lead time after it, never the reverse.
  const batasBayar = tagihanDue({ kind: "perpanjangan" }, [], now).dueAt;
  const tambahan = await siapkanLayanan(deps, hak, input.layanan ?? [], now, batasBayar);
  if (!tambahan.ok) return tambahan;
  // One quote for the Perpanjangan and the Layanan, so the Tagihan carries one Biaya Layanan Platform.
  const harga = await deps.tariffs.quote(
    [
      { kind: "perpanjangan", jenisMakamId: hak.jenisMakamId, tenure: { kind: "tahun", years: hak.tenureYears }, terms: input.terms },
      ...(tambahan.siap?.quoteLines ?? []),
    ],
    now,
  );
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const petakNomor = labelPetak(hak);
  let baris: NewTagihanLine[] | null;
  let perBaris: { label: string; amount: number }[] = [];
  let posisiAwal = 0;
  if (tambahan.siap && deps.layanan) {
    const gabungan = deps.layanan.gabungkanBaris(harga, tambahan.siap.item, { id: hak.lokasiId, name: aturan.name }, (line) => barisTagihan([line], hak.lokasiId, aturan.name)?.[0] ?? null);
    baris = gabungan.ok ? gabungan.lines : null;
    if (gabungan.ok) ({ perBaris, posisiAwal } = gabungan);
  } else {
    baris = barisTagihan(harga.lines, hak.lokasiId, aturan.name);
  }
  if (!baris) return { ok: false, reason: "tagihan_tidak_terbit" };

  const hasil = await refusable<
    | { ok: true; id: string; tagihan: Tagihan; layananNomor: string | null }
    | { ok: false; reason: "tagihan_terbuka"; tagihanTerbuka: TagihanTerbuka }
    | { ok: false; reason: "melebihi_batas_qris" | "tagihan_tidak_terbit" }
  >(deps.db, async (tx) => {
    // One order of this Hak Pakai at a time: the lock makes two clicks queue instead of both passing the check below.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`perpanjangan.${hak.id}`}))`);
    const terbuka = await terbukaOf({ ...deps, db: tx, billing: deps.billing.within(tx) }, hak.id, now);
    if (terbuka) return { ok: false, reason: "tagihan_terbuka", tagihanTerbuka: terbuka };
    // The Layanan are ordered under their own Nomor Pemesanan, which the Tagihan carries so a payment finds their jobs.
    const layananNomor = tambahan.siap ? await deps.billing.within(tx).nextNomorPemesanan() : null;
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "perpanjangan" },
      addressee: { name: nama, phoneNumber: telepon, accountId: akun.id },
      nomorPemesanan: layananNomor,
      placeName: aturan.name,
      lines: baris,
    });
    if (!tagihan.ok) return { ok: false, reason: issueRefusal(tagihan) };
    const [row] = await tx
      .insert(perpanjangan)
      .values({
        hakPakaiId: hak.id,
        lokasiId: hak.lokasiId,
        lokasiName: aturan.name,
        petakNomor,
        pemegangHakName: nama,
        terms: input.terms,
        tagihanId: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        pemohonAccountId: akun.id,
        email: akun.email,
        permohonanId: input.permohonanId,
        dibuatPada: now,
      })
      .returning({ id: perpanjangan.id });
    if (tambahan.siap && layananNomor && deps.layanan) {
      await deps.layanan.tulisCheckout(
        {
          mode: "perpanjangan",
          nomor: layananNomor,
          lokasiId: hak.lokasiId,
          petakId: tambahan.petakId,
          hakPakaiId: hak.id,
          lokasiName: aturan.name,
          petakNomor,
          pemesanName: nama,
          pemesanPhone: telepon,
          pemesanEmail: akun.email,
          pemesanAccountId: akun.id,
          tagihanId: tagihan.tagihan.id,
          total: tagihan.tagihan.total,
          createdAt: now,
          posisiAwal,
          item: tambahan.siap.item,
          perBaris,
        },
        tx,
      );
    }
    // The email is queued in this very transaction: a rolled-back order leaves no message behind.
    const diumumkan = await deps.notifikasi.tagihanTerbit(
      {
      tagihanId: tagihan.tagihan.id,
      momentKind: "perpanjangan",
      nomorTagihan: tagihan.tagihan.nomorTagihan,
      nomorPemesanan: layananNomor,
      email: akun.email,
      perihal: `Perpanjangan Makam di ${aturan.name}`,
      total: tagihan.tagihan.total,
      dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
      tx,
    );
    if (!diumumkan.ok) throw new Error(`the Tagihan of Perpanjangan ${row.id} could not be announced: ${diumumkan.reason}`);
    return { ok: true, id: row.id, tagihan: tagihan.tagihan, layananNomor };
  });
  if (!hasil.ok) return hasil;

  return {
    ok: true,
    perpanjangan: {
      id: hasil.id,
      terms: input.terms,
      tagihan: { nomorTagihan: hasil.tagihan.nomorTagihan, total: hasil.tagihan.total, dueAt: hasil.tagihan.dueAt, link: hasil.tagihan.link },
      layananNomor: hasil.layananNomor,
    },
  };
}

function issueRefusal(refusal: IssueRefusal): "melebihi_batas_qris" | "tagihan_tidak_terbit" {
  return refusal.reason === "melebihi_batas_qris" ? "melebihi_batas_qris" : "tagihan_tidak_terbit";
}

/** The quoted lines as Tagihan lines: the Perpanjangan tariff (the Lokasi Mitra's) and the Biaya Layanan Platform (the Operator's). */
function barisTagihan(quoted: readonly QuotedLine[], lokasiId: string, lokasiName: string): NewTagihanLine[] | null {
  const lines: NewTagihanLine[] = [];
  for (const line of quoted) {
    if (line.kind !== "perpanjangan" && line.kind !== "biaya_layanan_platform") return null;
    lines.push({
      kind: line.kind,
      label: quoteLineLabel(line),
      amount: line.amount,
      provider: line.provider.kind === "lokasi_mitra" ? { kind: "lokasi_mitra", lokasiId, name: lokasiName } : { kind: "operator" },
    });
  }
  return lines;
}


/**
 * The "Tambah Layanan" items of a Perpanjangan, checked against the Lokasi's offer and counted from the Tagihan's due date;
 * `siap` is null when none were added. The grave they are ordered for is the Hak Pakai's first Petak.
 */
async function siapkanLayanan(
  deps: PerpanjanganDeps,
  hak: DasarPesanan["hak"],
  items: unknown[],
  now: Date,
  batasBayar: Date,
): Promise<
  | { ok: true; siap: (Extract<Awaited<ReturnType<NonNullable<PerpanjanganDeps["layanan"]>["siapkanCheckout"]>>, { ok: true }>) | null; petakId: string }
  | { ok: false; reason: "layanan_tidak_tersedia" | "teks_kosong" | "target_kosong" | "lead_time_melewati" | "input_tidak_valid" }
> {
  if (items.length === 0) return { ok: true, siap: null, petakId: "" };
  if (!deps.layanan || !hak.petakId) return { ok: false, reason: "layanan_tidak_tersedia" };
  const siap = await deps.layanan.siapkanCheckout({ lokasiId: hak.lokasiId, mode: "perpanjangan", items, at: now, batasBayar });
  if (!siap.ok) return { ok: false, reason: siap.reason };
  return { ok: true, siap, petakId: hak.petakId };
}
