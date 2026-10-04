/**
 * Layanan at a DKI TPU (spec, Layanan > Order; stories 23 and 85; ticket 56): the
 * order a family places by **describing** a grave, and the hari-H items a Saat Duka
 * TPU order adds. Both become Pekerjaan Layanan a Mitra Jasa fulfils, at the DKI
 * price, with no Biaya Layanan Platform (the Operator's own Layanan margin is the
 * DKI price itself, spec, Out of scope).
 *
 * The two ways in differ in one thing only, which is when the money is due:
 *
 * - a **standalone** TPU order issues its own **pay-first** Tagihan, and the payment
 *   that settles it moves its jobs from Menunggu Pembayaran to Dijadwalkan (Billing's
 *   payment effect, `./pembayaran`);
 * - a **hari-H** item goes on the pay-after Saat Duka TPU Tagihan issued at the
 *   confirmation (ticket 45), which takes its due date, and its job is Dijadwalkan at
 *   that same confirmation with the burial day as its target. The Mitra Jasa's
 *   Pencairan does not wait for the family's payment (spec, Pengurusan), which is
 *   ticket 57's rule; what is recorded here is only the job and its Tagihan.
 *
 * Every rule about who may take a job lives in `./penugasan-tpu`; this file only says
 * what was ordered, for which grave, on which date.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap, type NewTagihanLine, type Tagihan } from "@/domain/billing";
import { normaliseEmail, normalisePhoneNumber, type PhoneNumberResult } from "@/domain/identity";
import type { QuotedLine } from "@/domain/tariffs";
import { documentExtension } from "@/lib/files/document-type";
import { hargaLayananPartLabel } from "@/lib/layanan-labels";
import type { Rupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { offerings, type LayananUntukPesanan, type VarianUntukOrder } from "./harga";
import { buktiTpuPerPekerjaan, keluhanTpuPerPekerjaan, type BuktiTpuTerbaca, type KeluhanTpuPemesan } from "./bukti-tpu-baca";
import { katalog } from "./katalog";
import { jendelaTarget, targetPalingDini } from "./pesanan";
import {
  layananMitraJasa,
  pekerjaanLayananTpu,
  pekerjaanLayananTpuPenugasan,
  type PekerjaanTpuStatus,
  type PekerjaanTpuSumber,
} from "./schema";
import {
  FOTO_MAKAM_TPU_MAX_BYTES,
  itemHariHTpuListSchema,
  placePesananLayananTpuSchema,
  type DeskripsiMakamTpu,
  type ItemHariHTpu,
} from "./tpu-skema";

/** A phone number the Tagihan could not be addressed to, as the Identity module words it. */
type PhoneRefusal = Extract<PhoneNumberResult, { ok: false }>["reason"];

/** The reference photo of a grave, as a screen hands it over. */
export interface FotoMakamTpu {
  body: Uint8Array;
  contentType: string;
}

/** The image types a reference photo of a grave may be. */
const FOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** One variant a TPU offers, with the facts that belong to its Layanan (lead time, text, hari-H). */
export type VarianTpuUntukOrder = VarianUntukOrder;

/**
 * Every Layanan variant offered at every DKI TPU at `at` (Admin Platform's "boleh di
 * TPU DKI" mark **and** a DKI price in force), each with its Layanan's own lead time,
 * text field and "bisa hari-H" flag. A TPU price is one DKI price, so the same list
 * answers for every TPU.
 */
export async function offeringsTpuUntukOrder(deps: LayananDeps, at: Date): Promise<VarianTpuUntukOrder[]> {
  const [ditawarkan, semua] = await Promise.all([offerings(deps, { kind: "tpu_dki" }, at), katalog(deps.db)]);
  const entryOf = new Map(semua.map((entry) => [entry.id, entry] as const));
  return ditawarkan.flatMap((varian) => {
    const entry = entryOf.get(varian.layananId);
    return entry
      ? [{ ...varian, leadTimeDays: entry.leadTimeDays, teksLabel: entry.teksLabel, proof: entry.proof, bisaHariH: entry.bisaHariH, adaDiPetakKosong: entry.adaDiPetakKosong }]
      : [];
  });
}

/**
 * The Layanan a DKI TPU offers for an order, in catalog order, each variant at its
 * DKI price alone (a TPU Tagihan carries no platform fee, so a variant's price is
 * also its total). `hariH` narrows to the items a Saat Duka checkout may add.
 */
export async function penawaranTpuUntukPesanan(deps: LayananDeps, at: Date, options: { hariH?: boolean } = {}): Promise<LayananUntukPesanan[]> {
  const [tersedia, semua] = await Promise.all([offeringsTpuUntukOrder(deps, at), katalog(deps.db)]);
  return semua
    .filter((entry) => !options.hariH || entry.bisaHariH)
    .map((entry) => ({
      layanan: entry,
      varian: tersedia
        .filter((varian) => varian.layananId === entry.id)
        .map((varian) => ({
          id: varian.id,
          layananId: entry.id,
          name: varian.name,
          harga: varian.harga.total,
          inForceSince: varian.harga.inForceSince,
        })),
    }))
    .filter((grup) => grup.varian.length > 0);
}

/** The all-in price of exactly these variants at a TPU, or null when one is not offered or the total passes the QRIS cap. */
export async function hargaPesananTpu(
  deps: LayananDeps,
  layananVariantIds: readonly string[],
  at: Date,
): Promise<{ total: number; parts: { label: string; amount: number }[] } | null> {
  if (layananVariantIds.length === 0) return null;
  const tersedia = new Map((await offeringsTpuUntukOrder(deps, at)).map((varian) => [varian.id, varian] as const));
  if (layananVariantIds.some((id) => !tersedia.has(id))) return null;
  const quoted = await deps.tariffs.quote(layananVariantIds.map((id) => ({ kind: "layanan_dki" as const, layananVariantId: id })), at);
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return null;
  return {
    total: quoted.total,
    parts: quoted.lines.map((line) => ({
      label: hargaLayananPartLabel(line, line.kind === "layanan_dki" ? tersedia.get(line.layananVariantId) : undefined),
      amount: line.amount,
    })),
  };
}

/** Why an order at a TPU cannot be placed. */
export type AlasanTolakPesananTpu =
  | "input_tidak_valid"
  /** No DKI TPU carries that id. */
  | "tpu_tidak_ada"
  /** A variant no TPU offers, or one with no DKI price in force. */
  | "layanan_tidak_tersedia"
  /** A quote line this flow cannot put on a Tagihan (never in practice: a widened quote). */
  | "baris_tidak_bisa_ditagih"
  /** A target date inside that Layanan's minimum lead time. */
  | "lead_time_melewati"
  /** A Layanan that asks for a text field, left empty. */
  | "teks_kosong"
  /** The all-in price could not be computed, or is past the QRIS cap. */
  | "harga_tidak_tersedia"
  | "tagihan_tidak_terbit"
  /** The email is not an Akun's Email Terverifikasi, or the Akun is not that email's. */
  | "email_bukan_akun_ini"
  /** The reference photo is not a photo we can read, or is too large. */
  | "foto_tidak_didukung"
  | "foto_terlalu_besar"
  | "berkas_gagal_disimpan"
  | PhoneRefusal;

export type PlacePesananLayananTpuResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "menunggu_pembayaran"; total: number };
      tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"]; link: string };
    }
  | { ok: false; reason: AlasanTolakPesananTpu };

/**
 * Places one order Layanan at a DKI TPU: the described grave, its items, the jobs
 * waiting for the money (one per item) and the pay-first Tagihan, in one transaction.
 * A refusal anywhere leaves nothing: no job, no Tagihan, no stored photo.
 */
export async function placePesananLayananTpu(
  deps: LayananDeps,
  pemesan: PemesanLayanan,
  rawInput: unknown,
  foto: FotoMakamTpu | null = null,
): Promise<PlacePesananLayananTpuResult> {
  const parsed = placePesananLayananTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const email = normaliseEmail(pemesan.email);
  if (email === null) return { ok: false, reason: "email_bukan_akun_ini" };
  const akun = await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "email_bukan_akun_ini" };
  const telepon = normalisePhoneNumber(input.phoneNumber);
  if (!telepon.ok) return { ok: false, reason: telepon.reason };

  const tpu = await deps.lokasi.publicTpuDki(input.tpuDkiId);
  if (!tpu) return { ok: false, reason: "tpu_tidak_ada" };

  const now = deps.clock.now();
  const tersedia = await offeringsTpuUntukOrder(deps, now);
  const item: { varian: VarianTpuUntukOrder; targetDate: string; teks: string | null }[] = [];
  for (const satu of input.item) {
    const varian = tersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
    if (!varian) return { ok: false, reason: "layanan_tidak_tersedia" };
    if (satu.targetDate < targetPalingDini(varian.leadTimeDays, now)) return { ok: false, reason: "lead_time_melewati" };
    const mauTeks = (varian.teksLabel ?? "") !== "";
    const teks = satu.teks?.trim() || null;
    if (mauTeks && teks === null) return { ok: false, reason: "teks_kosong" };
    item.push({ varian, targetDate: satu.targetDate, teks: mauTeks ? teks : null });
  }

  const quoted = await deps.tariffs.quote(item.map((satu) => ({ kind: "layanan_dki" as const, layananVariantId: satu.varian.id })), now);
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris = barisTagihanTpu(quoted.lines, item);
  if (!baris.ok) return baris;

  // The photo goes in before the row that points at it and comes out again when the
  // order cannot be written: a key nothing references is a dead file.
  let fotoKey: string | null = null;
  if (foto) {
    if (foto.body.byteLength > FOTO_MAKAM_TPU_MAX_BYTES) return { ok: false, reason: "foto_terlalu_besar" };
    const extension = documentExtension(foto, FOTO_TYPES);
    if (!extension) return { ok: false, reason: "foto_tidak_didukung" };
    const key = `pekerjaan-layanan-tpu/foto-makam/${randomUUID()}.${extension}`;
    try {
      await deps.files.put({ key, body: foto.body, contentType: foto.contentType });
    } catch {
      return { ok: false, reason: "berkas_gagal_disimpan" };
    }
    fotoKey = key;
  }
  const makam: DeskripsiMakamTpu = {
    blokNomor: input.makam.blokNomor,
    almarhumName: input.makam.almarhumName,
    keterangan: input.makam.keterangan,
    fotoKeys: fotoKey ? [fotoKey] : [],
    pin: input.makam.pin,
  };
  const pemesanName = input.pemesanName.trim();

  const hasil = await refusable<
    | { ok: true; pesanan: { nomor: string; status: "menunggu_pembayaran"; total: number }; tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"]; link: string } }
    | { ok: false; reason: "tagihan_tidak_terbit" }
  >(deps.db, async (tx) => {
    const billing = deps.billing.within(tx);
    const nomor = await billing.nextNomorPemesanan();
    const tagihan = await billing.issueTagihan({
      moment: { kind: "layanan" },
      addressee: { name: pemesanName, phoneNumber: telepon.phoneNumber, accountId: pemesan.accountId },
      nomorPemesanan: nomor,
      placeName: tpu.name,
      lines: baris.lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    for (const [posisi, satu] of item.entries()) {
      await tx.insert(pekerjaanLayananTpu).values({
        sumber: "pesanan_tpu",
        nomor,
        posisi,
        tagihanId: tagihan.tagihan.id,
        tpuId: tpu.id,
        tpuName: tpu.name,
        tpuAddress: tpu.address,
        makam,
        layananId: satu.varian.layananId,
        layananVariantId: satu.varian.id,
        label: baris.perBaris[posisi].label,
        teks: satu.teks,
        amount: baris.perBaris[posisi].amount as Rupiah,
        targetDate: satu.targetDate,
        status: "menunggu_pembayaran",
        pemesanAccountId: pemesan.accountId,
        pemesanName,
        pemesanEmail: email,
        pemesanPhone: telepon.phoneNumber,
        createdAt: now,
      });
    }

    // Queued on this very transaction: the family is told of an order that exists, and an order that exists is never unannounced.
    await deps.notifikasi.pesananTpuTerbit(tx, {
      nomor,
      email,
      pemesanName,
      tpu: { id: tpu.id, name: tpu.name },
      makam: { blokNomor: makam.blokNomor },
      item: item.map((satu, posisi) => ({ label: baris.perBaris[posisi].label, targetDate: satu.targetDate })),
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
    });

    return {
      ok: true as const,
      pesanan: { nomor, status: "menunggu_pembayaran" as const, total: tagihan.tagihan.total },
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
  if (!hasil.ok && fotoKey) await deps.files.delete(fotoKey).catch(() => undefined);
  return hasil;
}

/**
 * The Tagihan lines of a TPU order: one `layanan` line per item, carrying the target
 * date and lead time its due date is counted from, provided by the Operator. Any other
 * kind of quote line is a **refusal**, never a silent omission (an under-charged family
 * is exactly what the check is for).
 */
function barisTagihanTpu(
  quoted: readonly QuotedLine[],
  item: readonly { varian: VarianTpuUntukOrder; targetDate: string }[],
): { ok: true; lines: NewTagihanLine[]; perBaris: { label: string; amount: number }[] } | { ok: false; reason: "baris_tidak_bisa_ditagih" | "harga_tidak_tersedia" } {
  const lines: NewTagihanLine[] = [];
  const perBaris: { label: string; amount: number }[] = [];
  for (const line of quoted) {
    if (line.kind !== "layanan_dki") return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    const satu = item[perBaris.length];
    if (!satu) return { ok: false, reason: "harga_tidak_tersedia" };
    const label = hargaLayananPartLabel(line, satu.varian);
    lines.push({ kind: "layanan", label, amount: line.amount, provider: { kind: "operator" }, targetDate: satu.targetDate, leadTimeDays: satu.varian.leadTimeDays });
    perBaris.push({ label, amount: line.amount });
  }
  if (perBaris.length !== item.length) return { ok: false, reason: "harga_tidak_tersedia" };
  return { ok: true, lines, perBaris };
}

/* ── the hari-H items of a Saat Duka TPU order ── */

/** One hari-H item priced for the Tagihan the confirmation issues. */
export interface BarisHariHTpu {
  layananId: string;
  layananVariantId: string;
  label: string;
  amount: number;
  leadTimeDays: number;
  teks: string | null;
}

export type BarisHariHTpuResult =
  | { ok: true; baris: BarisHariHTpu[]; total: number }
  | { ok: false; reason: "input_tidak_valid" | "layanan_tidak_tersedia" | "teks_kosong" | "harga_tidak_tersedia" | "baris_tidak_bisa_ditagih" };

/**
 * Prices these hari-H items at the DKI price, or says why they cannot be offered: only
 * a variant marked "boleh di TPU DKI", with a DKI price in force, whose Layanan is "bisa
 * hari-H" may be added to a Saat Duka TPU order, and one whose Layanan asks for text must
 * carry it. Used at submission (so the family is refused early) and at the confirmation
 * (so the Tagihan is priced at the day it is issued, never at the day it was asked).
 */
export async function barisHariHTpu(deps: LayananDeps, rawItems: unknown, at: Date): Promise<BarisHariHTpuResult> {
  const parsed = itemHariHTpuListSchema.safeParse(rawItems);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const items = parsed.data;
  if (items.length === 0) return { ok: true, baris: [], total: 0 };

  const tersedia = await offeringsTpuUntukOrder(deps, at);
  const dipilih: { varian: VarianTpuUntukOrder; teks: string | null }[] = [];
  for (const satu of items) {
    const varian = tersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
    if (!varian || !varian.bisaHariH) return { ok: false, reason: "layanan_tidak_tersedia" };
    const mauTeks = (varian.teksLabel ?? "") !== "";
    const teks = satu.teks?.trim() || null;
    if (mauTeks && teks === null) return { ok: false, reason: "teks_kosong" };
    dipilih.push({ varian, teks: mauTeks ? teks : null });
  }
  const quoted = await deps.tariffs.quote(dipilih.map((satu) => ({ kind: "layanan_dki" as const, layananVariantId: satu.varian.id })), at);
  if (!quoted.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris: BarisHariHTpu[] = [];
  for (const line of quoted.lines) {
    if (line.kind !== "layanan_dki") return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    const satu = dipilih[baris.length];
    if (!satu) return { ok: false, reason: "harga_tidak_tersedia" };
    baris.push({
      layananId: satu.varian.layananId,
      layananVariantId: satu.varian.id,
      label: hargaLayananPartLabel(line, satu.varian),
      amount: line.amount,
      leadTimeDays: satu.varian.leadTimeDays,
      teks: satu.teks,
    });
  }
  if (baris.length !== dipilih.length) return { ok: false, reason: "harga_tidak_tersedia" };
  return { ok: true, baris, total: quoted.total };
}

/** What the confirmation hands over: the order the items are on, the grave, the family and the burial day. */
export interface JadwalkanHariHTpuInput {
  nomor: string;
  tagihanId: string;
  tpu: { id: string; name: string; address: string };
  makam: DeskripsiMakamTpu;
  pemesan: { accountId: string | null; name: string; email: string | null; phoneNumber: string | null };
  /** The burial day: the target date of every one of these jobs. */
  targetDate: string;
  baris: readonly BarisHariHTpu[];
}

/**
 * Creates the hari-H jobs of a confirmed Saat Duka TPU order, already Dijadwalkan:
 * the Tagihan they are billed on is pay-after, so nothing waits for money. Called by
 * the Pengurusan module's confirmation with **its own transaction** as `within`, so the
 * jobs exist exactly when the Tagihan does; without one it writes on the module's
 * database, which only a test that asks for it would do.
 */
export async function jadwalkanHariHTpu(deps: LayananDeps, input: JadwalkanHariHTpuInput): Promise<number> {
  const now = deps.clock.now();
  for (const [posisi, satu] of input.baris.entries()) {
    await deps.db.insert(pekerjaanLayananTpu).values({
      sumber: "saat_duka_tpu",
      nomor: input.nomor,
      posisi,
      tagihanId: input.tagihanId,
      tpuId: input.tpu.id,
      tpuName: input.tpu.name,
      tpuAddress: input.tpu.address,
      makam: input.makam,
      layananId: satu.layananId,
      layananVariantId: satu.layananVariantId,
      label: satu.label,
      teks: satu.teks,
      amount: satu.amount as Rupiah,
      targetDate: input.targetDate,
      status: "dijadwalkan",
      pemesanAccountId: input.pemesan.accountId,
      pemesanName: input.pemesan.name,
      pemesanEmail: input.pemesan.email,
      pemesanPhone: input.pemesan.phoneNumber,
      dijadwalkanAt: now,
      createdAt: now,
    });
  }
  return input.baris.length;
}

/** The burial day a hari-H item is targeted at, as a WIB calendar date. */
export function hariPemakaman(pemakamanAt: Date): string {
  return wibDateOf(pemakamanAt);
}

/* ── the payment effect ── */

/**
 * Moves every job of a paid standalone TPU order from Menunggu Pembayaran to
 * Dijadwalkan at the moment the money arrived. A payment for any other Tagihan is
 * ignored and a repeat is harmless (jobs are matched on their status). A hari-H job
 * is already Dijadwalkan, so a Saat Duka payment matches nothing here, which is the
 * spec's point: their scheduling never waited for the family's payment.
 */
export async function jadwalkanTpuDariPembayaran(db: Database, nomorPemesanan: string, paidAt: Date): Promise<number> {
  const moved = await db
    .update(pekerjaanLayananTpu)
    .set({ status: "dijadwalkan", dijadwalkanAt: paidAt })
    .where(
      and(
        eq(pekerjaanLayananTpu.nomor, nomorPemesanan),
        eq(pekerjaanLayananTpu.sumber, "pesanan_tpu"),
        eq(pekerjaanLayananTpu.status, "menunggu_pembayaran"),
      ),
    )
    .returning({ id: pekerjaanLayananTpu.id });
  return moved.length;
}

/* ── what the Pemesan reads ── */

/** How long the Mitra Jasa's photo link lives for the Pemesan, in seconds. */
export const FOTO_MITRA_JASA_URL_SECONDS = 300;

/** One job of a TPU order as the Pemesan who placed it reads it. */
export interface PekerjaanTpuPemesan {
  id: string;
  label: string;
  amount: number;
  targetDate: string;
  /** The ±2 days the work may be done in. */
  jendela: { dari: string; sampai: string };
  teks: string | null;
  status: PekerjaanTpuStatus;
  /** The Mitra Jasa's first name and photo, once they have accepted; null before, and never their surname or contact. */
  mitraJasa: { namaDepan: string; fotoUrl: string | null } | null;
  /** The proof, once Admin Platform has approved it (and never before): what was captured and a short-lived link. */
  bukti: BuktiTpuTerbaca[];
  /** Whether the Pemesan may file a Keluhan now, until when, and the one they filed. */
  keluhan: KeluhanTpuPemesan;
}

/** One order at a DKI TPU as its Pemesan reads it: standalone, or the hari-H items of a Saat Duka TPU order. */
export interface PesananTpuTerbaca {
  nomor: string;
  sumber: PekerjaanTpuSumber;
  tagihanId: string;
  tpu: { id: string; name: string; address: string };
  makam: { blokNomor: string; almarhumName: string; keterangan: string | null; adaFoto: boolean; pin: { lat: number; lng: number } | null };
  total: number;
  item: PekerjaanTpuPemesan[];
}

/** The first word of a name: what a family is told, never the rest. */
export function namaDepan(namaLengkap: string): string {
  return namaLengkap.trim().split(/\s+/)[0] ?? "";
}

/** The TPU jobs of one Nomor Pemesanan for the Pemesan who placed it, or null when it has none. */
export async function pesananTpuOf(deps: LayananDeps, nomor: string, pemesan: { accountId: string }): Promise<PesananTpuTerbaca | null> {
  if (!/^MKM-\d{4}-\d{6}$/.test(nomor)) return null;
  const jobs = await deps.db
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.nomor, nomor), eq(pekerjaanLayananTpu.pemesanAccountId, pemesan.accountId)))
    .orderBy(asc(pekerjaanLayananTpu.posisi));
  if (jobs.length === 0) return null;

  const diterima = await deps.db
    .select({
      pekerjaanId: pekerjaanLayananTpuPenugasan.pekerjaanId,
      namaLengkap: layananMitraJasa.namaLengkap,
      fotoFileKey: layananMitraJasa.fotoFileKey,
    })
    .from(pekerjaanLayananTpuPenugasan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, pekerjaanLayananTpuPenugasan.mitraJasaId))
    .where(and(inArray(pekerjaanLayananTpuPenugasan.pekerjaanId, jobs.map((job) => job.id)), eq(pekerjaanLayananTpuPenugasan.hasil, "diterima")));
  const keluhanOf = await keluhanTpuPerPekerjaan(deps.db, deps.clock.now(), jobs);
  const mitraOf = new Map(diterima.map((row) => [row.pekerjaanId, row] as const));
  // Only an approved proof is shown to the Pemesan: a job Menunggu Verifikasi has none to show yet.
  const buktiOf = await buktiTpuPerPekerjaan(
    deps,
    jobs.filter((job) => job.buktiDitunjukkanAt !== null).map((job) => job.id),
  );

  const [pertama] = jobs;
  return {
    nomor,
    sumber: pertama.sumber,
    tagihanId: pertama.tagihanId,
    tpu: { id: pertama.tpuId, name: pertama.tpuName, address: pertama.tpuAddress },
    makam: {
      blokNomor: pertama.makam.blokNomor,
      almarhumName: pertama.makam.almarhumName,
      keterangan: pertama.makam.keterangan,
      adaFoto: pertama.makam.fotoKeys.length > 0,
      pin: pertama.makam.pin,
    },
    total: jobs.reduce((jumlah, job) => jumlah + job.amount, 0),
    item: await Promise.all(
      jobs.map(async (job) => {
        const keluhan = keluhanOf.get(job.id);
        if (!keluhan) throw new Error(`no Keluhan read for job ${job.id}`);
        const mitra = mitraOf.get(job.id);
        return {
          id: job.id,
          label: job.label,
          amount: job.amount,
          targetDate: job.targetDate,
          jendela: jendelaTarget(job.targetDate),
          teks: job.teks,
          status: job.status,
          mitraJasa: mitra
            ? { namaDepan: namaDepan(mitra.namaLengkap), fotoUrl: await fotoUrl(deps, mitra.fotoFileKey) }
            : null,
          bukti: buktiOf.get(job.id) ?? [],
          keluhan,
        };
      }),
    ),
  };
}

/** A short-lived link to a stored photo, or null when there is none or it cannot be signed. */
export async function fotoUrl(deps: Pick<LayananDeps, "files">, key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await deps.files.signedUrl(key, { expiresInSeconds: FOTO_MITRA_JASA_URL_SECONDS });
  } catch {
    return null;
  }
}

export type { ItemHariHTpu };
