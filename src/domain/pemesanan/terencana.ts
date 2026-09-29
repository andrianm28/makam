/**
 * The Pemesanan Terencana wizard's own domain (spec, Pemesanan > Terencana;
 * Public site > Booking wizards): browsing the Lokasi Mitra that take a Terencana
 * order, picking exact plots on their Denah, and placing the order — which holds
 * the plots, snapshots the Syarat and takes a Nomor Pemesanan, all in one
 * transaction. The prices are always `quote()`'s, and a selection v1 may not take
 * (above the Rp 10.000.000 QRIS cap) is refused here, not only in the picker.
 */
import { and, asc, eq } from "drizzle-orm";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap, QRIS_PAYMENT_CAP } from "@/domain/billing";
import { normaliseEmail, normalisePhoneNumber } from "@/domain/identity";
import type { LokasiFacility } from "@/domain/lokasi";
import type { PublicDenah, PublicDenahBlok } from "@/domain/inventory";
import type { LokasiPublicPricing, QuotedLine } from "@/domain/tariffs";
import type { PemesananDeps, Pemesan, TerencanaQuery } from "./deps";
import { placeTerencanaSchema } from "./skema-terencana";
import { bolehDitahan, type TahanUnit } from "@/domain/inventory";
import { pemesananTerencana, pemesananTerencanaUnit, type CalonPenghuniTerencana, type PemegangHak, type PemesananTerencanaStatus, type SyaratTerencana } from "./schema";

/** One card of the Terencana wizard's Lokasi step. */
export interface KartuTerencana {
  lokasi: {
    id: string;
    name: string;
    city: string;
    address: string;
    pin: { lat: number; lng: number } | null;
    facilities: LokasiFacility[];
    /** When the Petugas Lapangan last visited, and the photos of that visit. */
    kunjungan: { visitedOn: string; photos: string[] } | null;
  };
  /**
   * "mulai Rp X": the cheapest Hak Pakai all-in a Pemesan may actually buy here,
   * which `lokasiPricing` only ever leaves within the payment cap; null when no
   * Jenis Makam here can be paid for, so no card ever shows a price the wizard
   * would refuse (spec, Billing: the listing hides a Jenis Makam above the cap).
   */
  mulaiDari: number | null;
  /** How many Petak Makam or Kavling Keluarga may be picked here right now (a Kavling Keluarga counts as one). */
  tersedia: number;
}

/**
 * The price bands of the Lokasi step, named after what a family recognises, and all
 * of them **inside** the one amount v1 can be paid for (the QRIS payment cap): a
 * filtered card then always leads to an order that can be paid, and a Lokasi Mitra
 * whose cheapest plot is above the cap is in no band at all (its own price is hidden,
 * like on the Lokasi page, because the wizard would refuse every order there).
 */
export const HARGA_BANDS = [
  { key: "hingga_3_juta", label: "Hingga Rp 3 jt", until: 3_000_000 },
  { key: "3_sampai_6_juta", label: "Rp 3–6 jt", until: 6_000_000 },
  { key: "di_atas_6_juta", label: `Di atas Rp 6 jt sampai ${rupiahPendek(QRIS_PAYMENT_CAP)}`, until: QRIS_PAYMENT_CAP },
] as const satisfies readonly { key: NonNullable<TerencanaQuery["harga"]>; label: string; until: number }[];

/** "Rp 10 jt" of a whole amount, the way the chips say it. */
function rupiahPendek(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(amount / 1_000_000))} jt`;
}

/**
 * Whether a Lokasi Mitra's cheapest buyable Hak Pakai falls in this band. A
 * Lokasi Mitra with nothing within the payment cap (its price is null) is in no band
 * at all: the wizard would refuse every order there, so a price filter never claims it.
 */
function dalamBand(harga: NonNullable<TerencanaQuery["harga"]>, mulaiDari: number | null): boolean {
  const index = HARGA_BANDS.findIndex((satu) => satu.key === harga);
  if (index < 0 || mulaiDari === null) return false;
  const bawah = index === 0 ? 0 : HARGA_BANDS[index - 1].until;
  return mulaiDari > bawah && mulaiDari <= HARGA_BANDS[index].until;
}

/**
 * Every Lokasi Mitra a Pemesan may place a Terencana order at: Terverifikasi and
 * listed, with "Pemesanan Terencana aktif" on, filtered by city, by the
 * all-in price band of its cheapest Hak Pakai and by facilities (spec, story 39).
 */
export async function pilihanTerencana(deps: PemesananDeps, query: TerencanaQuery = {}): Promise<KartuTerencana[]> {
  const now = deps.clock.now();
  const cards = await deps.lokasi.publicLokasiMitraList({ city: query.city, facilities: query.facilities, terencana: true });
  const priced = await Promise.all(
    cards.map(async (card) => ({ card, mulaiDari: (await deps.tariffs.lokasiPricing(card.id, now)).mulaiDari })),
  );
  const inBand = priced.filter(({ mulaiDari }) => (query.harga ? dalamBand(query.harga, mulaiDari) : true));
  const tersedia = await deps.inventory.tersediaUntukTerencana(inBand.map(({ card }) => card.id));

  return inBand.map(({ card, mulaiDari }) => ({
    lokasi: {
      id: card.id,
      name: card.name,
      city: card.city,
      address: card.address,
      pin: card.pin,
      facilities: card.facilities,
      kunjungan: card.kunjunganVerifikasi,
    },
    mulaiDari,
    tersedia: tersedia[card.id] ?? 0,
  }));
}

/** Every city with at least one Lokasi Mitra that takes a Terencana order, for the city filter. */
export async function kotaTerencana(deps: PemesananDeps): Promise<string[]> {
  const semua = await deps.lokasi.publicLokasiMitraList({ terencana: true });
  const cities = new Set(semua.map((card) => card.city));
  return [...cities].sort((a, b) => a.localeCompare(b, "id"));
}

/** One unit of the picker, as the order records it. */
export interface UnitTerencana {
  jenis: "petak" | "kavling";
  id: string;
  /** The Nomor Makam or Nomor Kavling the Pemesan picked it by. */
  nomor: string;
  jenisMakamId: string;
  jenisMakamName: string;
}

/**
 * What a Terencana selection costs right now, priced by `quote()`: one Harga Hak
 * Pakai per chosen unit and the one Biaya Layanan Platform of the whole Tagihan
 * (never one per unit), and whether v1 may be paid for the total.
 */
export interface BarisTotal {
  kind: QuotedLine["kind"];
  /** The chosen unit this line prices, by the number the family knows it by; null for the Tagihan's one platform fee. */
  nomor: string | null;
  amount: number;
}

export interface TotalTerencana {
  /** One line per chosen unit, then the one Biaya Layanan Platform of the whole Tagihan. */
  lines: BarisTotal[];
  total: number;
  /** Whether this selection may be taken in v1: its total is within the QRIS payment cap. */
  dalamBatas: boolean;
}

async function totalPemilihan(deps: PemesananDeps, units: readonly UnitTerencana[], at: Date): Promise<TotalTerencana> {
  const kosong: TotalTerencana = { lines: [], total: 0, dalamBatas: true };
  if (units.length === 0) return kosong;
  const harga = await deps.tariffs.quote(
    units.map((unit) => ({ kind: "harga_hak_pakai" as const, jenisMakamId: unit.jenisMakamId })),
    at,
  );
  if (!harga.ok) return kosong;
  return { lines: barisOf(units, harga.lines), total: harga.total, dalamBatas: withinPaymentCap(harga.total) };
}

/**
 * Priced lines, each naming the chosen unit it prices, so a screen can label the
 * breakdown without guessing. `quote()` returns one Harga Hak Pakai line per line it
 * was given, in the same order, so the units are read in the order they were chosen.
 */
function barisOf(units: readonly UnitTerencana[], lines: readonly QuotedLine[]): BarisTotal[] {
  let berikut = 0;
  return lines.map((line) => {
    const nomor = line.kind === "harga_hak_pakai" ? (units[berikut++]?.nomor ?? null) : null;
    return { kind: line.kind, nomor, amount: line.amount };
  });
}

/** The picker's screen: the Denah, what the chosen plots cost, the "Nanti" line and the Syarat to be shown before Kirim. */
export interface DenahTerencana {
  lokasi: { id: string; name: string; city: string; alamat: string };
  /** Every Blok with the state of each cell, its own count, and how many units may be picked here. */
  blok: PublicDenahBlok[];
  /** How many units a Pemesan may pick at this Lokasi Mitra right now. */
  tersedia: number;
  /** Every Jenis Makam this Lokasi Mitra sells a Hak Pakai of, by id: the Denah names ids, and a cell says which one it is. */
  jenisMakam: { id: string; name: string }[];
  /** The chosen plots this read could resolve, in the order they were chosen; a number that names nothing here is left out. */
  unit: UnitTerencana[];
  /** What the chosen plots cost, priced by `quote()` at this instant. */
  total: TotalTerencana;
  /** Biaya Pemakaman + Biaya Layanan Platform of one later burial, at this instant: the "Nanti" line, never part of the total now. */
  nanti: { total: number; lines: BarisTotal[] } | null;
  /** The Syarat as the Lokasi Mitra's policy reads now; the order keeps its own copy of them. */
  syarat: SyaratTerencana;
  /** The Admin Lokasi to reach about a plot that can only be a tumpang. */
  kontakSiaga: { email: string | null; phoneNumber: string } | null;
}

/**
 * The Denah of one Lokasi Mitra that takes Terencana orders, with the chosen plots
 * (if any) priced at this instant by `quote()`: one Harga Hak Pakai per unit and the
 * one Biaya Layanan Platform of the whole Tagihan, and whether that total is within
 * the payment cap. Null for a Lokasi Mitra that does not take Terencana orders (an
 * unknown id, one not Terverifikasi, or one with "Pemesanan Terencana aktif" off).
 */
export async function denahTerencana(deps: PemesananDeps, lokasiId: string, pilihan: PilihanTerencana = { petak: [], kavling: null }): Promise<DenahTerencana | null> {
  const profile = await deps.lokasi.publicLokasiMitra(lokasiId);
  const denah = await deps.inventory.publicDenah(lokasiId);
  if (!profile?.terencanaAktif || !denah) return null;
  const now = deps.clock.now();
  const [pricing, kontakSiaga] = await Promise.all([deps.tariffs.lokasiPricing(lokasiId, now), deps.lokasi.kontakSiagaOf(lokasiId)]);
  // The URL names the plots by their number; the Denah names them by id, so the choice is resolved here.
  const units = await unitsOfNomor(denah, pilihan, jenisMakamNames(pricing));
  const total = await totalPemilihan(deps, units, now);

  return {
    lokasi: { id: profile.id, name: profile.name, city: profile.city, alamat: profile.address },
    blok: denah.bloks,
    tersedia: denah.tersedia,
    jenisMakam: pricing.jenisMakam.map((card) => ({ id: card.jenisMakam.id, name: card.jenisMakam.name })),
    unit: units,
    total,
    nanti: pricing.biayaPemakaman ? { total: pricing.biayaPemakaman.total, lines: barisOf([], pricing.biayaPemakaman.lines) } : null,
    syarat: syaratOf(profile),
    kontakSiaga: kontakSiaga?.phoneNumber ? { email: kontakSiaga.email, phoneNumber: kontakSiaga.phoneNumber } : null,
  };
}

/** A chosen selection, as the wizard's URL carries it: the Nomor Makam of each Petak, or the Nomor Kavling of one Kavling Keluarga. */
export interface PilihanTerencana {
  petak: string[];
  kavling: string | null;
}

/** The chosen units as a Server Action carries them: Petak Makam by id, or one whole Kavling Keluarga by id. */
export type UnitsTerencana = TahanUnit[];

/** A proposed selection, as the picker and the order's own boundary both carry it. */
export interface PeriksaPilihanInput {
  lokasiId: string;
  units: TahanUnit[];
}


export interface PilihanDitolak {
  ok: false;
  reason: "tanpa_unit" | "unit_campur" | "unit_ganda" | "unit_tidak_ditemukan" | "sudah_dipesan" | "unit_tidak_bisa_dipilih";
  /** The plot the refusal is about, by the number the family knows it by; null when the shape of the selection is wrong. */
  nomor: string | null;
  /**
   * The units that are still pickable, in the order they were chosen, so the screen
   * can keep them and send the family back to the Denah with the other ones gone.
   */
  sisa: UnitTerencana[];
  /** The Denah's own word for a unit that is no longer pickable (e.g. "terisi"), for the message; absent for a malformed selection. */
  status?: string;
}

export type PeriksaPilihanResult = { ok: true } | PilihanDitolak;

/**
 * Whether a chosen selection can still be ordered, read at this moment: the
 * several-Petak-or-one-Kavling rule first, then every unit against the Denah. This
 * is the check the wizard's "Lanjut" and its Kirim both go through, so a plot taken
 * meanwhile is caught with the same words and the same other picks kept.
 */
export async function periksaPilihanTerencana(deps: PemesananDeps, input: PeriksaPilihanInput): Promise<PeriksaPilihanResult> {
  // The names first: an id that is no Petak Makam nor Kavling Keluarga of this Lokasi
  // Mitra is refused as unknown, before any rule about its shape or its state is read,
  // so no refusal ever has to invent a Nomor Makam for it.
  const units = await unitsOf(deps.inventory.publicDenah, input.lokasiId, input.units, new Map());
  if (!units) return { ok: false, reason: "unit_tidak_ditemukan", nomor: null, sisa: [] };

  const bentuk = bolehDitahan(input.units);
  if (!bentuk.ok) {
    const nomor = bentuk.reason === "unit_ganda" ? nomorOf(bentuk.unit, units) : null;
    return { ok: false, reason: bentuk.reason, nomor, sisa: [] };
  }

  const denah = await deps.inventory.publicDenah(input.lokasiId);
  const statusOf = new Map<string, string | null>();
  for (const blok of denah?.bloks ?? []) {
    for (const cell of blok.cells) if (cell.status !== null) statusOf.set(cell.id, cell.status);
    for (const kavling of blok.kavling) statusOf.set(kavling.id, kavling.status);
  }
  // Every unit is read, so a refusal can hand back every pick that is still good
  // (a family that picked three plots and lost the first keeps the other two).
  const bisa: UnitTerencana[] = [];
  let ditolak: PilihanDitolak | null = null;
  for (const unit of units) {
    const status = statusOf.get(unit.id);
    if (status === "bisa_dipilih") {
      bisa.push(unit);
      continue;
    }
    if (!ditolak) {
      ditolak = {
        ok: false,
        reason: status === "sedang_dipesan" ? "sudah_dipesan" : "unit_tidak_bisa_dipilih",
        nomor: unit.nomor,
        sisa: [],
        status: status ?? "tidak_tersedia",
      };
    }
  }
  if (!ditolak) return { ok: true };
  return { ...ditolak, sisa: bisa };
}

/** The Syarat Pemesanan Terencana, as a Lokasi Mitra's policy reads at this moment. */
function syaratOf(profile: NonNullable<Awaited<ReturnType<PemesananDeps["lokasi"]["publicLokasiMitra"]>>>): SyaratTerencana {
  return {
    masaPembatalanDays: profile.pembatalan.masaPembatalanDays,
    refundAfterMasaPembatalanPercent: profile.pembatalan.refundAfterMasaPembatalanPercent,
    hakDengan: "lokasi_mitra",
    lokasiNama: profile.name,
  };
}


export type PlaceTerencanaResult =
  | { ok: true; pemesanan: PemesananTerencanaOrder }
  | { ok: false; reason: "input_tidak_valid" }
  /** The Kode Masuk proved one email and the session belongs to another Akun. */
  | { ok: false; reason: "akun_tidak_cocok" }
  | { ok: false; reason: "telepon_tidak_valid" }
  /** The Pemegang Hak the Pemesan named is someone else, with a phone number that is not Indonesian. */
  | { ok: false; reason: "telepon_pemegang_hak_tidak_valid" }
  /** A Lokasi Mitra that does not take Terencana orders (unknown, not Terverifikasi, or the switch off). */
  | { ok: false; reason: "lokasi_tidak_ada" }
  /** A chosen id names no pickable Petak Makam or Kavling Keluarga of this Lokasi Mitra (a link from before a renumbering). */
  | { ok: false; reason: "unit_tidak_ditemukan" }
  /** A Petak Makam and a Kavling Keluarga in one order: a Kavling Family is one indivisible unit, so this is never a mix. */
  | { ok: false; reason: "unit_campur" }
  /** The same plot named twice in one order, or none at all. */
  | { ok: false; reason: "unit_ganda" | "tanpa_unit"; nomor?: string }
  /** One chosen unit is not a pickable Petak Makam or Kavling Keluarga any more; the order is rolled back whole. */
  | { ok: false; reason: "sudah_dipesan"; nomor: string }
  | { ok: false; reason: "unit_tidak_bisa_dipilih"; nomor: string; status: string }
  /** v1 takes no order whose Tagihan would pass the Rp 10.000.000 QRIS cap. */
  | { ok: false; reason: "melebihi_batas_qris"; total: number }
  | { ok: false; reason: "harga_tidak_tersedia" };

/**
 * Places a Pemesanan Terencana: it holds every chosen plot, takes the next Nomor
 * Pemesanan, keeps a copy of the Syarat the family was shown, and comes back
 * Diajukan. Everything happens in one transaction, so a plot taken meanwhile, a
 * price above the cap or a refusal anywhere leaves no order, no hold and no gap
 * in the Nomor Pemesanan series.
 */
export async function placeTerencana(deps: PemesananDeps, input: unknown): Promise<PlaceTerencanaResult> {
  const parsed = placeTerencanaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const draft = parsed.data;
  const email = normaliseEmail(draft.pemesan.email);
  const phone = normalisePhoneNumber(draft.phoneNumber);
  if (!email) return { ok: false, reason: "input_tidak_valid" };
  if (!phone.ok) return { ok: false, reason: "telepon_tidak_valid" };

  const akun = await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== draft.pemesan.accountId) return { ok: false, reason: "akun_tidak_cocok" };

  // The Pemegang Hak is recorded with their own contact, so an invalid number is refused here rather than
  // quietly replaced by the Pemesan's.
  let pemegangHak: PemegangHak;
  if (draft.pemegangHak.mode === "pemesan") {
    pemegangHak = { mode: "pemesan", name: draft.pemegangHak.name ?? draft.pemesanName, phoneNumber: phone.phoneNumber, email };
  } else {
    const holderPhone = normalisePhoneNumber(draft.pemegangHak.phoneNumber);
    if (!holderPhone.ok) return { ok: false, reason: "telepon_pemegang_hak_tidak_valid" };
    pemegangHak = {
      mode: "lain",
      name: draft.pemegangHak.name,
      phoneNumber: holderPhone.phoneNumber,
      email: draft.pemegangHak.email ? normaliseEmail(draft.pemegangHak.email) : null,
    };
  }
  const calonPenghuni: CalonPenghuniTerencana =
    draft.calonPenghuni.mode === "saya" ? { mode: "saya", name: null } : { mode: "lain", name: draft.calonPenghuni.name };

  const result = await refusable<PlaceTerencanaResult>(deps.db, async (tx) => {
    const now = deps.clock.now();
    const profile = await deps.lokasi.publicLokasiMitra(draft.lokasiId);
    if (!profile?.terencanaAktif) return { ok: false, reason: "lokasi_tidak_ada" };

    // The same check the wizard's "Lanjut" made, read again here: a plot may have been taken since.
    const dicek = await periksaPilihanTerencana(deps, { lokasiId: draft.lokasiId, units: draft.units });
    if (!dicek.ok) return refusalOf(dicek);

    const inventory = deps.inventory.within(tx);
    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    const ditahan = await inventory.tahan({ lokasiId: draft.lokasiId, units: draft.units, nomorPemesanan: nomor });
    if (!ditahan.ok) {
      if (ditahan.reason === "sudah_dipesan") return { ok: false, reason: "sudah_dipesan", nomor: ditahan.nomor };
      if (ditahan.reason === "unit_tidak_bisa_dipilih") return { ok: false, reason: "unit_tidak_bisa_dipilih", nomor: ditahan.nomor, status: ditahan.status };
      return ditahan;
    }
    const pricing = await deps.tariffs.lokasiPricing(draft.lokasiId, now);
    const units = await unitsOf(inventory.publicDenah, draft.lokasiId, draft.units, jenisMakamNames(pricing));
    if (!units) return { ok: false, reason: "unit_tidak_ditemukan" };

    const harga = await deps.tariffs.quote(
      units.map((unit) => ({ kind: "harga_hak_pakai" as const, jenisMakamId: unit.jenisMakamId })),
      now,
    );
    if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
    if (!withinPaymentCap(harga.total)) return { ok: false, reason: "melebihi_batas_qris", total: harga.total };

    const pemesan: Pemesan = { accountId: akun.id, email };
    const [order] = await tx
      .insert(pemesananTerencana)
      .values({
        nomor,
        status: "diajukan",
        lokasiId: draft.lokasiId,
        lokasiName: profile.name,
        pemesanAccountId: pemesan.accountId,
        pemesanName: draft.pemesanName,
        email: pemesan.email,
        phoneNumber: phone.phoneNumber,
        pemegangHak,
        calonPenghuni,
        syarat: syaratOf(profile),
        diajukanAt: now,
      })
      .returning({ id: pemesananTerencana.id });
    await tx.insert(pemesananTerencanaUnit).values(
      units.map((unit, index) => ({
        pemesananId: order.id,
        lokasiId: draft.lokasiId,
        petakId: unit.jenis === "petak" ? unit.id : null,
        kavlingId: unit.jenis === "kavling" ? unit.id : null,
        nomorMakam: unit.jenis === "petak" ? unit.nomor : null,
        nomorKavling: unit.jenis === "kavling" ? unit.nomor : null,
        jenisMakamId: unit.jenisMakamId,
        jenisMakamName: unit.jenisMakamName,
        urutan: String(index + 1),
      })),
    );

    return {
      ok: true,
      pemesanan: {
        nomor,
        status: "diajukan",
        lokasi: { id: draft.lokasiId, name: profile.name },
        pemesan: { name: draft.pemesanName, email: pemesan.email, phoneNumber: phone.phoneNumber },
        pemegangHak,
        calonPenghuni,
        syarat: syaratOf(profile),
        unit: units.map((unit) => ({ jenis: unit.jenis, nomor: unit.nomor, jenisMakamName: unit.jenisMakamName })),
        konfirmasiDueAt: null,
        tagihanId: null,
        alasan: null,
        diajukanAt: now,
      },
    } satisfies PlaceTerencanaResult;
  });

  // The Lokasi Mitra's staff hear about the order through the Notifications module, never from here, and only once the
  // order and its hold are committed: an announcement about a rolled-back order would be a lie nobody can act on.
  if (result.ok) {
    const penerima = await deps.identity.adminLokasiOf(draft.lokasiId);
    await deps.notifikasi.terencanaDiajukan({
      nomor: result.pemesanan.nomor,
      lokasi: { id: draft.lokasiId, name: result.pemesanan.lokasi.name },
      unit: result.pemesanan.unit.map((satu) => ({ nomor: satu.nomor, jenisMakamName: satu.jenisMakamName })),
      calon: { name: result.pemesanan.calonPenghuni.name ?? result.pemesanan.pemegangHak.name },
      pemesan: { name: result.pemesanan.pemesan.name, phoneNumber: result.pemesanan.pemesan.phoneNumber },
      penerima: penerima.map((satu) => ({ accountId: satu.accountId })),
    });
  }
  return result;
}

/** What each chosen id is, with the Jenis Makam that prices it; null when the Denah names no such pickable unit. */
async function unitsOf(
  denahOf: (lokasiId: string) => Promise<{ bloks: PublicDenahBlok[] } | null>,
  lokasiId: string,
  units: readonly TahanUnit[],
  namaJenisMakam: ReadonlyMap<string, string>,
): Promise<UnitTerencana[] | null> {
  const denah = await denahOf(lokasiId);
  if (!denah) return null;
  const byId = new Map<string, Omit<UnitTerencana, "jenisMakamName">>();
  void 0;
  for (const blok of denah.bloks) {
    for (const cell of blok.cells) {
      if (!cell.jenisMakamId || cell.status === null) continue;
      byId.set(cell.id, { jenis: "petak", id: cell.id, nomor: cell.nomorMakam ?? "", jenisMakamId: cell.jenisMakamId });
    }
    for (const kavling of blok.kavling) {
      byId.set(kavling.id, { jenis: "kavling", id: kavling.id, nomor: kavling.nomorKavling, jenisMakamId: kavling.jenisMakamId });
    }
  }
  const found: UnitTerencana[] = [];
  for (const satuUnit of units) {
    // The module's own boundary has already refused a unit that names neither a Petak Makam nor a Kavling Keluarga.
    const id = ("petakId" in satuUnit ? satuUnit.petakId : satuUnit.kavlingId)!;
    const satu = byId.get(id);
    if (!satu) return null;
    found.push(unit(satu.jenis, satu.id, satu.nomor, satu.jenisMakamId, namaJenisMakam));
  }
  return found;
}

/** Every Jenis Makam this Lokasi Mitra sells, by id, as its name: the Denah names ids only, and Tariffs owns the names. */
function jenisMakamNames(pricing: LokasiPublicPricing): Map<string, string> {
  return new Map(pricing.jenisMakam.map((card) => [card.jenisMakam.id, card.jenisMakam.name]));
}

/** One Pemesanan Terencana of that Akun, by its Nomor Pemesanan, or null when no such order is theirs. */
export interface PemesananTerencanaOrder {
  nomor: string;
  status: PemesananTerencanaStatus;
  lokasi: { id: string; name: string };
  pemesan: { name: string; email: string; phoneNumber: string };
  pemegangHak: PemegangHak;
  calonPenghuni: CalonPenghuniTerencana;
  /** The Syarat as they were when the order was placed: never re-read from the Lokasi Mitra's current policy. */
  syarat: SyaratTerencana;
  /** Every chosen unit, in the order the Pemesan picked them. */
  unit: { jenis: "petak" | "kavling"; nomor: string; jenisMakamName: string }[];
  konfirmasiDueAt: Date | null;
  tagihanId: string | null;
  alasan: string | null;
  diajukanAt: Date;
}

/**
 * One Pemesanan Terencana of that Pemesan, with the Syarat it was placed under.
 * The Syarat come from the order's own snapshot, so a Lokasi Mitra that later
 * changes its Masa Pembatalan or its refund does not change what this family
 * agreed to. No actor: the caller has already established who is asking (the
 * guard's `pemesanan.lihat` on the Akun's own orders).
 */
export async function terencanaOf(deps: Pick<PemesananDeps, "db">, pemesan: { accountId: string }, nomor: string): Promise<PemesananTerencanaOrder | null> {
  const [row] = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.nomor, nomor), eq(pemesananTerencana.pemesanAccountId, pemesan.accountId)));
  if (!row) return null;
  const units = await deps.db
    .select()
    .from(pemesananTerencanaUnit)
    .where(eq(pemesananTerencanaUnit.pemesananId, row.id))
    .orderBy(asc(pemesananTerencanaUnit.urutan));

  return {
    nomor: row.nomor,
    status: row.status,
    lokasi: { id: row.lokasiId, name: row.lokasiName },
    pemesan: { name: row.pemesanName, email: row.email, phoneNumber: row.phoneNumber },
    pemegangHak: row.pemegangHak,
    calonPenghuni: row.calonPenghuni,
    syarat: row.syarat,
    unit: units.map((unit) => ({
      jenis: unit.petakId ? ("petak" as const) : ("kavling" as const),
      nomor: unit.nomorMakam ?? unit.nomorKavling ?? "",
      jenisMakamName: unit.jenisMakamName,
    })),
    konfirmasiDueAt: row.konfirmasiDueAt,
    tagihanId: row.tagihanId,
    alasan: row.alasan,
    diajukanAt: row.diajukanAt,
  };
}

/**
 * The chosen plots by number, resolved against the Denah: the unit each one stands for,
 * with the Jenis Makam that prices it. A number that names nothing here (renumbered away,
 * or a link from before) is left out, so a screen never shows a pick it cannot order.
 */
function unitsOfNomor(denah: PublicDenah, pilihan: PilihanTerencana, namaJenisMakam: ReadonlyMap<string, string>): UnitTerencana[] {
  const cells = new Map(denah.bloks.flatMap((blok) => blok.cells.filter((cell) => cell.status !== null).map((cell) => [cell.nomorMakam, cell] as const)));
  const kavling = new Map(denah.bloks.flatMap((blok) => blok.kavling.map((satu) => [satu.nomorKavling, satu] as const)));
  const found: UnitTerencana[] = [];
  for (const nomor of pilihan.petak) {
    const cell = cells.get(nomor);
    if (cell?.jenisMakamId) found.push(unit("petak", cell.id, nomor, cell.jenisMakamId, namaJenisMakam));
  }
  if (pilihan.kavling) {
    const satu = kavling.get(pilihan.kavling);
    if (satu) found.push(unit("kavling", satu.id, satu.nomorKavling, satu.jenisMakamId, namaJenisMakam));
  }
  return found;
}

function unit(jenis: "petak" | "kavling", id: string, nomor: string, jenisMakamId: string, namaJenisMakam: ReadonlyMap<string, string>): UnitTerencana {
  return { jenis, id, nomor, jenisMakamId, jenisMakamName: namaJenisMakam.get(jenisMakamId) ?? "" };
}

/** The number a family knows the named unit by, or null when it is not one of the units resolved. */
function nomorOf(unit: string, units: readonly UnitTerencana[]): string | null {
  return units.find((satu) => satu.id === unit)?.nomor ?? null;
}

/** A refused selection, in the order's own words: the plot is named whenever there is one. */
function refusalOf(ditolak: PilihanDitolak): PlaceTerencanaResult {
  switch (ditolak.reason) {
    case "unit_campur":
      return { ok: false, reason: "unit_campur" };
    case "unit_ganda":
      // Every unit has been resolved against the Denah before this, so a doubled one
      // is a plot the family knows by number; if it somehow is not, it is unknown.
      if (ditolak.nomor === null) return { ok: false, reason: "unit_tidak_ditemukan" };
      return { ok: false, reason: "unit_ganda", nomor: ditolak.nomor };
    case "sudah_dipesan":
      if (ditolak.nomor === null) return { ok: false, reason: "unit_tidak_ditemukan" };
      return { ok: false, reason: "sudah_dipesan", nomor: ditolak.nomor };
    case "unit_tidak_bisa_dipilih":
      if (ditolak.nomor === null) return { ok: false, reason: "unit_tidak_ditemukan" };
      return { ok: false, reason: "unit_tidak_bisa_dipilih", nomor: ditolak.nomor, status: ditolak.status ?? "tidak_tersedia" };
    default:
      return { ok: false, reason: "unit_tidak_ditemukan" };
  }
}
