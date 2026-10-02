/**
 * The release map (ADR 0006, UAT 07): the one place that says which release opens
 * each feature, which routes and scheduled ticks belong to it, and nothing else.
 * Plain data and pure functions, so a client component may import it; what the
 * running environment has open is read in `./rilis` (server side only).
 *
 * Ticket numbers are the spec's Release plan: Rilis 2 is 35, 39, 41, 42, 59 and 84,
 * Rilis 3 is 43-48, 55-57 and the TPU parts of 51-53 and 58; everything else,
 * Layanan Makam at a Lokasi Mitra (49-54) included, is Rilis 1. Ticket 35's "Makamkan di sini" routes are
 * under `perpanjangan_lanjutan` here; tickets 39 and 84 have no route or tick of their own on `main` yet: when they land, their
 * routes join it too, and the guard test
 * (`rilis-guard.test.ts`) fails until they do.
 */

export type Rilis = 1 | 2 | 3;

export const fiturRilis = {
  /** Everything the first release carries (ADR 0005 and ADR 0006 included). */
  inti: 1,
  /** Perpanjangan continued: berkas and Permohonan, and the Hak Pakai reminders and expiry (41, 42, 39; 35 when it lands). */
  perpanjangan_lanjutan: 2,
  /** Ditangguhkan / Berhenti of a Lokasi Mitra (59). */
  lokasi_ditangguhkan: 2,
  /** DKI TPU: catalog, Saat Duka at a TPU, filing and Surat Kuasa, the TPU Layanan order (43-48, 56). */
  tpu: 3,
  /** Mitra Jasa, the TPU jobs they do and the Keluhan TPU (55, 57). */
  mitra_jasa: 3,
  /** Wakaf Tanah (58). */
  wakaf: 3,
} as const satisfies Record<string, Rilis>;

export type Fitur = keyof typeof fiturRilis;

/** Whether a feature is open when `rilis` is the number the environment carries. */
export function terbukaDi(fitur: Fitur, rilis: Rilis): boolean {
  return fiturRilis[fitur] <= rilis;
}

/**
 * Route patterns, from the URL (route groups left out). `[x]` stands for any one
 * segment; a trailing `/**` takes the route and everything below it; otherwise a
 * pattern takes exactly its own route. The most specific pattern wins.
 */
export const peraturanRute: ReadonlyArray<readonly [pattern: string, fitur: Fitur]> = [
  ["/", "inti"],
  ["/akun/**", "inti"],
  ["/akun/persetujuan/**", "perpanjangan_lanjutan"],
  ["/akun/wakaf/**", "wakaf"],
  ["/cara-kami-bekerja", "inti"],
  ["/dokumen/**", "inti"],
  ["/faq", "inti"],
  ["/health", "inti"],
  ["/hubungi-kami", "inti"],
  ["/layanan/**", "inti"],
  ["/layanan/tpu/**", "tpu"],
  ["/lokasi/**", "inti"],
  ["/makam-keluarga", "inti"],
  ["/masuk/**", "inti"],
  ["/pembatalan/**", "inti"],
  ["/pengurusan/**", "tpu"],
  ["/pengurusan-tpu", "tpu"],
  ["/perpanjangan/[x]", "inti"],
  ["/perpanjangan/[x]/berkas/**", "perpanjangan_lanjutan"],
  ["/perpanjangan/permohonan/**", "perpanjangan_lanjutan"],
  ["/permintaan-hak-pakai/**", "perpanjangan_lanjutan"],
  ["/pesan-makam/makamkan-di-sini/**", "perpanjangan_lanjutan"],
  ["/pesan-makam/saat-duka/**", "inti"],
  ["/pesan-makam/saat-duka/tpu/**", "tpu"],
  ["/pesan-makam/pengurusan-iptm/**", "tpu"],
  ["/pesan-makam/terencana/**", "inti"],
  ["/pesanan/**", "inti"],
  ["/segera-hadir", "inti"],
  ["/tentang-kami", "inti"],
  ["/tpu/**", "tpu"],
  ["/wakaf-tanah/**", "wakaf"],
  // Staff.
  ["/staf", "inti"],
  ["/staf/email", "inti"],
  ["/staf/totp", "inti"],
  ["/staf/petugas-lapangan/**", "inti"],
  ["/staf/mitra-jasa/**", "mitra_jasa"],
  ["/staf/admin-lokasi", "inti"],
  ["/staf/admin-lokasi/[x]", "inti"],
  ...["antrean", "audit-log", "denah", "hak-pakai", "jam-operasional", "pekerjaan", "pesanan", "petak", "tagihan-lewat-jatuh-tempo"].map(
    (area) => [`/staf/admin-lokasi/[x]/${area}/**`, "inti"] as const,
  ),
  ["/staf/admin-lokasi/[x]/perpanjangan/**", "perpanjangan_lanjutan"],
  ["/staf/admin-lokasi/[x]/permintaan/**", "perpanjangan_lanjutan"],
  ["/staf/admin-platform", "inti"],
  ...[
    "antrean",
    "desain",
    "hari-libur",
    "keluhan",
    "laporan",
    "layanan",
    "lokasi",
    "pemulihan-akun",
    "pengaturan-operator",
    "pengembalian",
    "penilaian",
    "setor-retribusi",
    "staf",
    "tagihan",
    "tagihan-lewat-jatuh-tempo",
    "tarif",
    "thread",
    "transfer",
    "tugas-lapangan",
  ].map((area) => [`/staf/admin-platform/${area}/**`, "inti"] as const),
  ["/staf/admin-platform/tpu/**", "tpu"],
  ["/staf/admin-platform/pengurusan/**", "tpu"],
  ["/staf/admin-platform/pekerjaan-tpu/**", "mitra_jasa"],
  ["/staf/admin-platform/keluhan-tpu/**", "mitra_jasa"],
  ["/staf/admin-platform/mitra-jasa/**", "mitra_jasa"],
  ["/staf/admin-platform/wakaf/**", "wakaf"],
];

/** Every scheduled tick of the worker (`scheduledTicks`), by its queue name; the ones not listed are Rilis 1. */
export const petaTick: Readonly<Record<string, Fitur>> = {
  "scheduler.heartbeat": "inti",
  "identity.prune_ip_requests": "inti",
  "inventory.prune_cari_makam_attempts": "inti",
  "billing.lapse_pay_first_tagihan": "inti",
  "billing.lewat_jatuh_tempo_pay_after": "inti",
  "billing.retry_payment_effects": "inti",
  "notifications.kirim_pesan": "inti",
  "notifications.chasing_eskalasi": "inti",
  "notifications.kirim_peringatan_antrean": "inti",
  "notifications.kirim_peringatan_staf": "inti",
  "pemesanan.realert_saat_duka": "inti",
  "pemesanan.lewat_batas_bayar_terencana": "inti",
  "pemesanan.catat_pemakaman": "inti",
  "payouts.pencairan_due": "inti",
  "payouts.potongan_usia": "inti",
  "refunds.materialise": "inti",
  "queues.peringatan_tier1": "inti",
  "queues.bertugas_otomatis_mati": "inti",
  // Layanan Makam at a Lokasi Mitra is Rilis 1 (ADR 0006); the scorecard and the accept deadline are Mitra Jasa's.
  // The filing-only Pengurusan IPTM (ticket 47) is Rilis 3 with the other DKI TPU work.
  "pengurusan.pembayaran_berkas": "tpu",
  "pengurusan.pengingat_iptm": "tpu",
  "layanan.tandai_terlambat": "inti",
  "layanan.jadwalkan_tertunda": "inti",
  "layanan.tutup_jendela_keluhan": "inti",
  "layanan.batalkan_tagihan_lapse": "inti",
  "layanan.paket_siklus": "inti",
  "layanan.tinjau_skor_mitra_jasa": "mitra_jasa",
  "layanan.tandai_tidak_direspons": "mitra_jasa",
  "lokasi.berhenti_berlaku": "lokasi_ditangguhkan",
  "inventory.hak_pakai_kedaluwarsa": "perpanjangan_lanjutan",
  "perpanjangan.pengingat_hak_pakai": "perpanjangan_lanjutan",
};

export function fiturUntukTick(name: string): Fitur | undefined {
  return petaTick[name];
}

const segmen = (path: string) => path.split("/").filter(Boolean);

/** How well a pattern fits a route, or null when it does not fit; the higher score is the more specific pattern. */
const SKOR_PER_SEGMEN = 1000;
const SKOR_PER_SEGMEN_TETAP = 10;
function skorKecocokan(pattern: string, parts: string[]): number | null {
  const prefix = pattern.endsWith("/**");
  const patternParts = segmen(prefix ? pattern.slice(0, -3) : pattern);
  if (prefix ? parts.length < patternParts.length : parts.length !== patternParts.length) return null;
  let literal = 0;
  for (const [index, part] of patternParts.entries()) {
    if (part === "[x]") continue;
    if (part !== parts[index]) return null;
    literal += 1;
  }
  // Longer, then more literal segments, then an exact route over a prefix.
  return patternParts.length * SKOR_PER_SEGMEN + literal * SKOR_PER_SEGMEN_TETAP + (prefix ? 0 : 1);
}

/** The feature a route belongs to; undefined when no pattern covers it (which the guard test refuses). */
export function fiturUntukRute(path: string, search = ""): Fitur | undefined {
  const parts = segmen(path);
  // The TPU half of the Lokasi directory is the same page.
  if (parts.length === 1 && parts[0] === "lokasi" && new URLSearchParams(search).get("jenis") === "tpu") return "tpu";
  let terbaik: { skor: number; fitur: Fitur } | undefined;
  for (const [pattern, fitur] of peraturanRute) {
    const skor = skorKecocokan(pattern, parts);
    if (skor !== null && (!terbaik || skor > terbaik.skor)) terbaik = { skor, fitur };
  }
  return terbaik?.fitur;
}

/** Staff pages answer 404 when closed; public and Akun Saya pages say "Segera hadir". */
export function permukaanRute(path: string): "staf" | "publik" {
  return path === "/staf" || path.startsWith("/staf/") ? "staf" : "publik";
}
