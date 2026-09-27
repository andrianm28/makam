/**
 * The catalog export an owner hands this tool (ticket 86). The old Laravel app
 * is the source the runbook's query is written for, but nothing here is
 * specific to it: the contract is a catalog.
 *
 * The source's own database is never read here: its owner runs one read-only
 * query (docs/ops/runbook.md, "Importing the old app's cemetery catalog") and
 * gives us the result, so what crosses over is exactly the whitelisted catalog
 * columns and nothing else. This module is the contract that result must meet,
 * and a test holds the runbook's query to it.
 *
 * Two guards, in this order:
 *
 * 1. `kolomPii`: a personal column anywhere in the document (an email, a phone
 *    number, a KTP, a name of a Pemesan, an Akun id, a document, a Tagihan) is
 *    refused by name, before Zod ever looks at the values, so no personal value
 *    reaches v1, the report or a log.
 * 2. the schemas below are strict: a column the contract has no field for is
 *    refused too, rather than imported silently.
 */
import { z } from "zod";
import type { Tenure } from "@/domain/tariffs";
import { rupiahSchema, type Rupiah } from "@/lib/rupiah";

/** The one export format this tool reads; anything else is refused. */
export const KATALOG_LAMA_FORMAT = "makam.katalog-lama/v1";

/**
 * Column names that may never be in a catalog export, and why. A key that
 * matches any of these is refused wherever it appears in the document.
 *
 * A cemetery's own `alamat`, `nama` and `pengelola` are catalog (the pin, the
 * facilities and the prices describe the place, not a person), so they are
 * absent here on purpose; a person's `alamat` or `nama` is caught by the
 * `pemesan` / `almarhum` / `ahli_waris` / `domisili` / `user` parts.
 */
export const kolomPii: readonly { pola: RegExp; alasan: string }[] = [
  { pola: /e?mail/i, alasan: "email" },
  { pola: /(^|_)hp($|_)|handphone|telepon|(^|_)telp($|_)|phone|wa_?number|no_?wa/i, alasan: "nomor telepon" },
  { pola: /(^|_)(nik|ktp|kk)($|_)|no_?ktp|no_?kk/i, alasan: "identitas kependudukan" },
  { pola: /password|passwd|secret|token|api_?key|hash/i, alasan: "kredensial" },
  { pola: /(^|_)(user|akun|pengguna|account|member)($|_)|created_?by|updated_?by/i, alasan: "akun" },
  { pola: /pemesan|pengirim|almarhum|ahli_?waris|domisili|waris|kontak|jemaah/i, alasan: "data orang" },
  { pola: /(^|_)(pesanan|order|tagihan|invoice|transaksi|pembayaran|bayar)($|_)/i, alasan: "transaksi" },
  { pola: /dokumen|ktp_scan|akta|surat_?powered|pdf_?scan/i, alasan: "dokumen" },
  { pola: /rekening|(^|_)bank($|_)|no_?rek/i, alasan: "rekening" },
];

/** One personal key found in a document: where it was, and why that is personal. */
export interface KolomPiiDitemukan {
  /** The path it was found at, e.g. `lokasi[0].no_hp`. */
  kolom: string;
  /** Which kind of personal data it is, from `kolomPii`. */
  alasan: string;
}

/**
 * The one position this tool takes on free-text values: a value that looks like
 * personal data, or that embeds a structured document (a JSON object or array
 * pasted into a note), is refused by name. The column-name guard above cannot
 * see either, because both arrive in a field the catalog contract does have.
 */
export const nilaiPii: readonly { pola: RegExp; alasan: string }[] = [
  ...kolomPii,
  { pola: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, alasan: "alamat email" },
  { pola: /(^|\D)(\+62|62|0)8(?:[\s-]?\d){7,12}(?!\d)/, alasan: "nomor telepon Indonesia" },
  { pola: /[\[{]/, alasan: "dokumen tertanam (JSON)" },
];

/** Every free-text value in a document, in the order it appears, with its path. */
export function nilaiPiiDi(value: unknown, path = ""): { kolom: string; alasan: string }[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => nilaiPiiDi(entry, `${path}[${index}]`));
  if (typeof value === "string") {
    const cocok = nilaiPii.find(({ pola }) => pola.test(value));
    return cocok ? [{ kolom: path, alasan: cocok.alasan }] : [];
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
    nilaiPiiDi(entry, path ? `${path}.${key}` : key),
  );
}

/** Every personal key in a document, in the order it appears, with its reason. */
export function kolomPiiDi(value: unknown, path = ""): KolomPiiDitemukan[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => kolomPiiDi(entry, `${path}[${index}]`));
  if (value === null || typeof value !== "object") return [];
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
    at: path ? `${path}.${key}` : key,
    entry,
    cocok: kolomPii.find(({ pola }) => pola.test(key)),
  }));
  return [
    ...entries.flatMap(({ at, cocok }) => (cocok ? [{ kolom: at, alasan: cocok.alasan }] : [])),
    ...entries.flatMap(({ at, entry }) => kolomPiiDi(entry, at)),
  ];
}

const teks = (max: number) => z.string().trim().max(max);
const kode = z.string().trim().min(1).max(60);

const titikSchema = z.object({ lat: z.number().min(-11.5).max(6.5), lng: z.number().min(94.5).max(141.5) }).strict();

const masaHakSchema = z.discriminatedUnion("jenis", [
  z.object({ jenis: z.literal("selamanya") }).strict(),
  z.object({ jenis: z.literal("tahun"), tahun: z.number().int().min(1).max(100) }).strict(),
]);

/**
 * A price the source only estimates: a range with a source, never a price
 * anything is sold at. The old app keeps these as `price_min` / `price_max`
 * with a `price_source`, and its own migration says a package price of that
 * kind "is not added to a cart, not quoted, not paid". v1's Harga Hak Pakai is
 * a price a Tagihan is issued for, so this range is reported and asked about,
 * never entered as one (the plan refuses that Jenis Makam).
 */
const hargaIndikatifSchema = z
  .object({
    min: rupiahSchema.nullable().default(null),
    max: rupiahSchema.nullable().default(null),
    sumber: teks(120).nullable().default(null),
    berlakuMulai: z.iso.date().nullable().default(null),
  })
  .strict();

/** One Jenis Makam of the source: a class of grave, with a price or with an indicative range. */
const jenisMakamSchema = z
  .object({
    kode,
    nama: z.string().trim().min(1).max(120),
    deskripsi: teks(500).default(""),
    /** Whole rupiah, or null when the source only had an indicative range. */
    hargaHakPakai: rupiahSchema.nullable().default(null),
    masaHak: masaHakSchema.nullable().default(null),
    /** Per term; required for a fixed term, which the plan checks. */
    hargaPerpanjangan: rupiahSchema.nullable().default(null),
    hargaIndikatif: hargaIndikatifSchema.nullable().default(null),
    /**
     * The date the price came into force, when the source kept one. A date
     * before today is refused by the plan: v1 never rewrites a price that was
     * already in force, so the owner decides (the report counts these).
     */
    berlakuMulai: z.iso.date().nullable().default(null),
  })
  .strict()
  .superRefine((jenis, ctx) => {
    // A price v1 issues a Tagihan for is a price with a term; a range is not one.
    if (jenis.hargaHakPakai !== null && jenis.masaHak === null) {
      ctx.addIssue({ code: "custom", path: ["masaHak"], message: "hargaHakPakai butuh masaHak" });
    }
  });

/**
 * The pin a Google Maps URL carries, in the three shapes those links come in:
 * `?q=lat,lng`, `@lat,lng` and the `!3d…!4d…` of an embedded map. A short link
 * (`maps.app.goo.gl/…`) has no coordinates in it and would need resolving over
 * the network, so the export must carry the point itself.
 */
function titikFromGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  const pola = [
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];
  for (const regex of pola) {
    const found = url.match(regex);
    if (!found) continue;
    const titik = titikSchema.safeParse({ lat: Number(found[1]), lng: Number(found[2]) });
    if (titik.success) return titik.data;
  }
  return null;
}

const lokasiSchema = z
  .object({
    /** The source's own code for this cemetery: the key the import is idempotent on. */
    kode,
    nama: z.string().trim().min(1).max(200),
    /**
     * Who runs the cemetery, as the source names it; null when the source has
     * none. v1's `pengelolaName` is required, so the plan refuses a Lokasi with
     * none rather than inventing a placeholder name for a field a person reads.
     */
    pengelola: teks(200).nullable().default(null),
    alamat: z.string().trim().min(1).max(500),
    kota: z.string().trim().min(1).max(120),
    /** A point in Indonesia, or a Google Maps URL to read it from; null when the source had none. */
    titik: titikSchema.nullable().default(null),
    googleMapsUrl: z.string().trim().max(500).optional(),
    /**
     * The source's own facility labels, verbatim: they are free text there, so
     * the plan maps the ones it recognises onto v1's closed list and reports
     * every other one instead of guessing which facility was meant.
     */
    fasilitas: z.array(teks(60)).max(20).default([]),
    catatanFasilitas: teks(1000).default(""),
    /**
     * The source's own publication status, as it stores it (`draft`,
     * `published`, `unpublished`; research 2026-09-27, §1.3), or null when it
     * had none. It is a different axis from v1's Belum Tayang, so it is
     * carried into the report and asked about, never acted on: every imported
     * Lokasi Mitra starts Belum Tayang, as any other one does.
     */
    statusTerbit: teks(32).nullable().default(null),
    /**
     * The source's own estimate of what a grave here costs (the old app's
     * `cemeteries.price_min` / `price_max`): a range, never a price anything is
     * charged at. The plan reports it and asks; it never becomes a Tarif.
     */
    hargaIndikatif: hargaIndikatifSchema.nullable().default(null),
    biayaPemakaman: z
      .object({ biayaPemakaman: rupiahSchema, biayaPemakamanTumpang: rupiahSchema.nullable().default(null) })
      .strict()
      .nullable()
      .default(null),
    jenisMakam: z.array(jenisMakamSchema).default([]),
  })
  .strict()
  .superRefine((lokasi, ctx) => {
    if (lokasi.titik || !lokasi.googleMapsUrl) return;
    if (titikFromGoogleMapsUrl(lokasi.googleMapsUrl)) return;
    ctx.addIssue({
      code: "custom",
      path: ["googleMapsUrl"],
      message: "tidak ada koordinat di URL ini; isi \"titik\" (lat, lng) sebagai gantinya",
    });
  });

const eksporSchema = z
  .object({
    format: z.literal(KATALOG_LAMA_FORMAT),
    /** When the owner ran the query; for the report, never a v1 date. */
    dieksporPada: z.iso.date().optional(),
    lokasi: z.array(lokasiSchema).max(500),
  })
  .strict();

/** A Jenis Makam of the source, as the plan reads it. */
export interface KatalogLamaJenisMakam {
  kode: string;
  nama: string;
  deskripsi: string;
  /** Null when the source only had an indicative range: the plan refuses it. */
  hargaHakPakai: Rupiah | null;
  masaHak: Tenure | null;
  hargaPerpanjangan: Rupiah | null;
  /** A range the source estimated, never charged; reported, never entered. */
  hargaIndikatif: { min: Rupiah | null; max: Rupiah | null; sumber: string | null; berlakuMulai: string | null } | null;
  berlakuMulai: string | null;
}

/** A Lokasi Mitra of the source, as the plan reads it. */
export interface KatalogLamaLokasi {
  kode: string;
  nama: string;
  /** Null when the source names no one; the plan refuses the Lokasi rather than invent a name. */
  pengelola: string | null;
  alamat: string;
  kota: string;
  pin: { lat: number; lng: number } | null;
  /** The source's own labels, verbatim: the plan maps what it recognises and reports the rest. */
  fasilitas: string[];
  catatanFasilitas: string;
  statusTerbit: string | null;
  /** The source's own estimate for this cemetery: reported, never entered as a price. */
  hargaIndikatif: { min: Rupiah | null; max: Rupiah | null; sumber: string | null; berlakuMulai: string | null } | null;
  biayaPemakaman: { biayaPemakaman: Rupiah; biayaPemakamanTumpang: Rupiah | null } | null;
  jenisMakam: KatalogLamaJenisMakam[];
}

export interface KatalogLamaEkspor {
  format: typeof KATALOG_LAMA_FORMAT;
  dieksporPada: string | null;
  lokasi: KatalogLamaLokasi[];
}

/**
 * Every field each level of the contract has, so a test can hold the runbook's
 * documented query to it: a field the contract adds and the query does not
 * export (or a key the query writes and the contract has no field for) fails
 * there rather than in an import.
 */
export const KUNCI_EKSPOR = Object.keys(eksporSchema.shape);
export const KUNCI_LOKASI = Object.keys(lokasiSchema.shape);
export const KUNCI_JENIS_MAKAM = Object.keys(jenisMakamSchema.shape);
export const KUNCI_HARGA_INDIKATIF = Object.keys(hargaIndikatifSchema.shape);

export type BacaEksporHasil =
  | { ok: true; ekspor: KatalogLamaEkspor }
  /** A personal column is in the document: refused by name, its value never read. */
  | { ok: false; reason: "kolom_pii_dilarang"; kolom: KolomPiiDitemukan[] }
  /** A free-text value carries personal data or an embedded document: refused by name. */
  | { ok: false; reason: "nilai_pii_dilarang"; nilai: { kolom: string; alasan: string }[] }
  /** Not a catalog export this tool understands: the first thing wrong with it. */
  | { ok: false; reason: "bukan_ekspor_katalog"; detail: string };

/** `lokasi[0].jenisMakam[1].hargaHakPakai`, for the report and the CLI's error line. */
export function jalurDari(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (sofar, segment) =>
      typeof segment === "number" ? `${sofar}[${segment}]` : sofar ? `${sofar}.${String(segment)}` : String(segment),
    "",
  );
}

/** A document at last, or refused with the first thing wrong with it. */
export function bacaEkspor(dokumen: unknown): BacaEksporHasil {
  const kolom = kolomPiiDi(dokumen);
  if (kolom.length > 0) return { ok: false, reason: "kolom_pii_dilarang", kolom };
  const nilai = nilaiPiiDi(dokumen);
  if (nilai.length > 0) return { ok: false, reason: "nilai_pii_dilarang", nilai };
  const parsed = eksporSchema.safeParse(dokumen);
  if (!parsed.success) {
    const [pertama] = parsed.error.issues;
    return {
      ok: false,
      reason: "bukan_ekspor_katalog",
      detail: pertama ? `${jalurDari(pertama.path)}: ${pertama.message}` : "dokumen tidak terbaca",
    };
  }
  return {
    ok: true,
    ekspor: {
      format: parsed.data.format,
      dieksporPada: parsed.data.dieksporPada ?? null,
      lokasi: parsed.data.lokasi.map((lokasi) => ({
        kode: lokasi.kode,
        nama: lokasi.nama,
        pengelola: lokasi.pengelola,
        alamat: lokasi.alamat,
        kota: lokasi.kota,
        pin: lokasi.titik ?? (lokasi.googleMapsUrl ? titikFromGoogleMapsUrl(lokasi.googleMapsUrl) : null),
        fasilitas: lokasi.fasilitas,
        catatanFasilitas: lokasi.catatanFasilitas,
        statusTerbit: lokasi.statusTerbit,
        hargaIndikatif: lokasi.hargaIndikatif,
        biayaPemakaman: lokasi.biayaPemakaman,
        jenisMakam: lokasi.jenisMakam.map((jenis) => ({
          kode: jenis.kode,
          nama: jenis.nama,
          deskripsi: jenis.deskripsi,
          hargaHakPakai: jenis.hargaHakPakai,
          masaHak:
            jenis.masaHak === null
              ? null
              : jenis.masaHak.jenis === "selamanya"
                ? { kind: "selamanya" }
                : { kind: "tahun", years: jenis.masaHak.tahun },
          hargaPerpanjangan: jenis.hargaPerpanjangan,
          hargaIndikatif: jenis.hargaIndikatif,
          berlakuMulai: jenis.berlakuMulai,
        })),
      })),
    },
  };
}
