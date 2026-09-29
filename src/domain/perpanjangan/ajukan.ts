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
import { withinPaymentCap, type IssueRefusal, type NewTagihanLine, type Tagihan } from "@/domain/billing";
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
      /** Set while an earlier Perpanjangan of this Hak Pakai still waits for its money. */
      tagihanTerbuka: TagihanTerbuka | null;
    }
  | { boleh: false; catatan: CatatanPerpanjangan };

/** Who is asking, when someone is signed in: the Akun and the Email Terverifikasi it holds. */
export interface Pemohon {
  accountId: string;
  email: string;
}

/** The facts of one Hak Pakai every step reads, or the note that stops it. */
async function fakta(deps: PerpanjanganDeps, hakPakaiId: string) {
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  if (!hak) return { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const aturan = await deps.lokasi.aturanPerpanjanganOf(hak.lokasiId);
  if (!aturan) return { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const hariIni = wibDateOf(deps.clock.now());
  const boleh = bolehDiperpanjang(hak, hariIni, aturan.masaTenggangMonths);
  // A Hak Pakai that has ended or is perpetual has nothing to extend, whatever else is true of it.
  if (!boleh.boleh && (boleh.catatan.kind === "selamanya" || (boleh.catatan.kind === "hubungi_admin_lokasi" && (boleh.catatan.sebab === "berakhir" || boleh.catatan.sebab === "dibatalkan")))) {
    return { ok: false as const, catatan: boleh.catatan };
  }
  // An overdue pay-after Tagihan on the Hak Pakai blocks until it is paid.
  const penghalang = await deps.pemesanan.tagihanPenghalangOf(hak.id);
  if (penghalang) return { ok: false as const, catatan: { kind: "lunasi_tagihan", nomorTagihan: penghalang.nomorTagihan, link: penghalang.link } satisfies CatatanPerpanjangan };
  if (!boleh.boleh) return { ok: false as const, catatan: boleh.catatan };
  return { ok: true as const, hak, aturan, jendela: boleh, hariIni };
}

/** The Petak Makam, or the Kavling Keluarga with its Petak, as the family knows it. */
function labelPetak(hak: { petakNomor: string[]; nomorKavling: string | null }): string {
  return hak.nomorKavling ? `Kavling ${hak.nomorKavling} (${hak.petakNomor.join(", ")})` : hak.petakNomor.join(", ");
}

/** The Perpanjangan of this Hak Pakai that still waits for its money, if there is one. */
async function terbukaOf(deps: PerpanjanganDeps, hakPakaiId: string, now: Date): Promise<TagihanTerbuka | null> {
  const rows = await deps.db
    .select()
    .from(perpanjangan)
    .where(eq(perpanjangan.hakPakaiId, hakPakaiId))
    .orderBy(desc(perpanjangan.dibuatPada));
  for (const row of rows) {
    if (row.dibayarPada) continue;
    const tagihan = await deps.billing.tagihan(row.tagihanId);
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
    tagihanTerbuka: await terbukaOf(deps, hak.id, deps.clock.now()),
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
});
export type AjukanPerpanjanganInput = z.infer<typeof ajukanPerpanjanganSchema>;

export type AjukanResult =
  | {
      ok: true;
      perpanjangan: { id: string; terms: number; tagihan: { nomorTagihan: string; total: number; dueAt: Date; link: string } };
    }
  | { ok: false; reason: "input_tidak_valid" | "harga_tidak_tersedia" | "kontak_pemegang_hak_kosong" | "tagihan_tidak_terbit" }
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

  if (input.terms > aturan.maxPerpanjanganTerms) return { ok: false, reason: "terms_melebihi_batas", maxTerms: aturan.maxPerpanjanganTerms };
  const nama = hak.pemegangHak?.name;
  const telepon = hak.pemegangHak?.phoneNumber;
  if (!nama || !telepon) return { ok: false, reason: "kontak_pemegang_hak_kosong" };
  if (!hak.jenisMakamId || hak.tenureYears === null) return { ok: false, reason: "harga_tidak_tersedia" };

  const harga = await deps.tariffs.quote(
    [{ kind: "perpanjangan", jenisMakamId: hak.jenisMakamId, tenure: { kind: "tahun", years: hak.tenureYears }, terms: input.terms }],
    now,
  );
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris = barisTagihan(harga.lines, hak.lokasiId, aturan.name);
  if (!baris) return { ok: false, reason: "tagihan_tidak_terbit" };
  const petakNomor = labelPetak(hak);

  const hasil = await refusable<
    | { ok: true; id: string; tagihan: Tagihan }
    | { ok: false; reason: "tagihan_terbuka"; tagihanTerbuka: TagihanTerbuka }
    | { ok: false; reason: "melebihi_batas_qris" | "tagihan_tidak_terbit" }
  >(deps.db, async (tx) => {
    // One order of this Hak Pakai at a time: the lock makes two clicks queue instead of both passing the check below.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`perpanjangan.${hak.id}`}))`);
    const terbuka = await terbukaOf({ ...deps, db: tx, billing: deps.billing.within(tx) }, hak.id, now);
    if (terbuka) return { ok: false, reason: "tagihan_terbuka", tagihanTerbuka: terbuka };
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "perpanjangan" },
      addressee: { name: nama, phoneNumber: telepon, accountId: akun.id },
      nomorPemesanan: null,
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
        dibuatPada: now,
      })
      .returning({ id: perpanjangan.id });
    return { ok: true, id: row.id, tagihan: tagihan.tagihan };
  });
  if (!hasil.ok) return hasil;

  await deps.notifikasi.tagihanTerbit({
    tagihanId: hasil.tagihan.id,
    momentKind: "perpanjangan",
    nomorTagihan: hasil.tagihan.nomorTagihan,
    nomorPemesanan: null,
    email: akun.email,
    perihal: `Perpanjangan Makam di ${aturan.name}`,
    total: hasil.tagihan.total,
    dueAt: hasil.tagihan.dueAt,
    link: hasil.tagihan.link,
  });
  return {
    ok: true,
    perpanjangan: {
      id: hasil.id,
      terms: input.terms,
      tagihan: { nomorTagihan: hasil.tagihan.nomorTagihan, total: hasil.tagihan.total, dueAt: hasil.tagihan.dueAt, link: hasil.tagihan.link },
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

