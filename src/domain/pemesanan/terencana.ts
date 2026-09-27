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
import { withinPaymentCap } from "@/domain/billing/batas";
import { normaliseEmail, normalisePhoneNumber } from "@/domain/identity";
import type { LokasiFacility } from "@/domain/lokasi";
import type { PublicDenahBlok } from "@/domain/inventory";
import type { LokasiPublicPricing, QuotedLine } from "@/domain/tariffs";
import { z } from "zod";
import type { PemesananDeps, Pemesan, TerencanaQuery } from "./deps";
import type { HargaUnit } from "./harga-terencana";
import { pemesananTerencana, pemesananTerencanaUnit, type CalonPenghuniTerencana, type PemegangHakTerencana, type PemesananTerencanaStatus, type SyaratTerencana } from "./schema";

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
  /** "mulai Rp X": the cheapest Hak Pakai all-in a Pemesan may buy here (null when no Jenis Makam is priced within the cap). */
  mulaiDari: number | null;
  /** How many Petak Makam or Kavling Keluarga may be picked here right now (a Kavling Keluarga counts as one). */
  tersedia: number;
}

const hargaBands: Record<NonNullable<TerencanaQuery["harga"]>, (mulai: number | null) => boolean> = {
  hingga_10_juta: (mulai) => mulai !== null && mulai <= 10_000_000,
  "10_sampai_25_juta": (mulai) => mulai !== null && mulai > 10_000_000 && mulai <= 25_000_000,
  di_atas_25_juta: (mulai) => mulai !== null && mulai > 25_000_000,
};

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
  const inBand = priced.filter(({ mulaiDari }) => (query.harga ? hargaBands[query.harga](mulaiDari) : true));
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

/** The picker's screen: the Denah, what each unit costs, the "Nanti" line and the Syarat to be shown before Kirim. */
export interface DenahTerencana {
  lokasi: { id: string; name: string; city: string; alamat: string };
  blok: PublicDenahBlok[];
  /** What one unit of each Jenis Makam costs, as `quote()` priced it, for the sticky total as the family taps. */
  harga: (HargaUnit & { jenisMakamName: string })[];
  /** Biaya Pemakaman + Biaya Layanan Platform of one later burial, at this instant: the "Nanti" line, never part of the total now. */
  nanti: { total: number; lines: QuotedLine[] } | null;
  /** The Syarat as the Lokasi Mitra's policy reads now; the order keeps its own copy of them. */
  syarat: SyaratTerencana;
  /** The Admin Lokasi to reach about a plot that can only be a tumpang. */
  kontakSiaga: { email: string | null; phoneNumber: string } | null;
}

/**
 * The Denah of one Lokasi Mitra that takes Terencana orders, priced at this
 * instant; null for one that does not (an unknown id, one not Terverifikasi, or
 * one with "Pemesanan Terencana aktif" off).
 */
export async function denahTerencana(deps: PemesananDeps, lokasiId: string): Promise<DenahTerencana | null> {
  const profile = await deps.lokasi.publicLokasiMitra(lokasiId);
  const denah = await deps.inventory.publicDenah(lokasiId);
  if (!profile?.terencanaAktif || !denah) return null;
  const [pricing, kontakSiaga] = await Promise.all([deps.tariffs.lokasiPricing(lokasiId, deps.clock.now()), deps.lokasi.kontakSiagaOf(lokasiId)]);

  const harga = pricing.jenisMakam.flatMap((card) => {
    const hargaHakPakai = card.hakPakai.lines.find((line) => line.kind === "harga_hak_pakai");
    const layananPlatform = card.hakPakai.lines.find((line) => line.kind === "biaya_layanan_platform");
    if (!hargaHakPakai || !layananPlatform) return [];
    return [{ jenisMakamId: card.jenisMakam.id, jenisMakamName: card.jenisMakam.name, hargaHakPakai: hargaHakPakai.amount, biayaLayananPlatform: layananPlatform.amount }];
  });

  return {
    lokasi: { id: profile.id, name: profile.name, city: profile.city, alamat: profile.address },
    blok: denah.bloks,
    harga,
    nanti: pricing.biayaPemakaman ? { total: pricing.biayaPemakaman.total, lines: pricing.biayaPemakaman.lines } : null,
    syarat: syaratOf(profile),
    kontakSiaga: kontakSiaga?.phoneNumber ? { email: kontakSiaga.email, phoneNumber: kontakSiaga.phoneNumber } : null,
  };
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

const pemegangHakSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("pemesan"), name: z.string().trim().min(1).max(200) }),
  z.object({
    mode: z.literal("lain"),
    name: z.string().trim().min(1).max(200),
    phoneNumber: z.string().trim().min(1).max(30),
    email: z.string().trim().max(320),
  }),
]);

const calonSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("saya") }),
  z.object({ mode: z.literal("lain"), name: z.string().trim().min(1).max(200) }),
]);

const unitSchema = z.union([z.object({ petakId: z.uuid() }).strict(), z.object({ kavlingId: z.uuid() }).strict()]);

const placeSchema = z.object({
  pemesan: z.object({ accountId: z.string().min(1), email: z.email() }),
  pemesanName: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().min(1).max(30),
  lokasiId: z.uuid(),
  units: z.array(unitSchema).min(1).max(50),
  pemegangHak: pemegangHakSchema,
  calonPenghuni: calonSchema,
});

export type PlaceTerencanaInput = z.infer<typeof placeSchema>;

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
  const parsed = placeSchema.safeParse(input);
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
  let pemegangHak: PemegangHakTerencana;
  if (draft.pemegangHak.mode === "pemesan") {
    pemegangHak = { mode: "pemesan", name: draft.pemegangHak.name, phoneNumber: phone.phoneNumber, email };
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

    const inventory = deps.inventory.within(tx);
    const pricing = await deps.tariffs.lokasiPricing(draft.lokasiId, now);
    const units = await unitsOf(inventory.publicDenah, draft.lokasiId, draft.units, jenisMakamNames(pricing));
    if (!units) return { ok: false, reason: "unit_tidak_ditemukan" };

    const harga = await deps.tariffs.quote(
      units.map((unit) => ({ kind: "harga_hak_pakai" as const, jenisMakamId: unit.jenisMakamId })),
      now,
    );
    if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
    if (!withinPaymentCap(harga.total)) return { ok: false, reason: "melebihi_batas_qris", total: harga.total };

    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    const ditahan = await inventory.tahan({ lokasiId: draft.lokasiId, units: draft.units, nomorPemesanan: nomor });
    if (!ditahan.ok) {
      if (ditahan.reason === "sudah_dipesan") return { ok: false, reason: "sudah_dipesan", nomor: ditahan.nomor };
      if (ditahan.reason === "unit_tidak_bisa_dipilih") return { ok: false, reason: "unit_tidak_bisa_dipilih", nomor: ditahan.nomor, status: ditahan.status };
      return { ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "", status: ditahan.reason };
    }

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
  if (result.ok) await deps.notifikasi.pemesananTerencanaDiajukan({ nomor: result.pemesanan.nomor, lokasiId: draft.lokasiId, email });
  return result;
}

/** What each chosen id is, with the Jenis Makam that prices it; null when the Denah names no such pickable unit. */
async function unitsOf(
  denahOf: (lokasiId: string) => Promise<{ bloks: PublicDenahBlok[] } | null>,
  lokasiId: string,
  units: PlaceTerencanaInput["units"],
  namaJenisMakam: ReadonlyMap<string, string>,
): Promise<UnitTerencana[] | null> {
  const denah = await denahOf(lokasiId);
  if (!denah) return null;
  const byId = new Map<string, Omit<UnitTerencana, "jenisMakamName">>();
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
  for (const unit of units) {
    const id = "petakId" in unit ? unit.petakId : unit.kavlingId;
    const satu = byId.get(id);
    if (!satu || !namaJenisMakam.has(satu.jenisMakamId)) return null;
    found.push({ ...satu, jenisMakamName: namaJenisMakam.get(satu.jenisMakamId)! });
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
  pemegangHak: PemegangHakTerencana;
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
