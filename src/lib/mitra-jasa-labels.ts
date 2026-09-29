import type { LangkahOnboarding, MitraJasaStatus } from "@/domain/layanan";

/** How each Mitra Jasa status is named on screen (CONTEXT.md: Aktif / Ditangguhan / Berhenti). */
export const mitraJasaStatusLabels: Record<MitraJasaStatus, string> = {
  aktif: "Aktif",
  ditangguhkan: "Ditangguhan",
  berhenti: "Berhenti",
};

/** What each step of a Mitra Jasa's onboarding is called on the profile page. */
export const langkahOnboardingLabels: Record<LangkahOnboarding, string> = {
  namaLengkap: "Nama lengkap",
  nik: "NIK",
  area: "Area tempat tinggal",
  ktp: "Foto KTP",
  foto: "Foto Mitra Jasa",
  perjanjian: "Scan perjanjian bertanda tangan",
  rekening: "Rekening Pencairan",
  coverageTpu: "Daftar TPU DKI yang dilayani",
  coverageLayanan: "Daftar Layanan yang dilayani",
};

/** What each of the five scorecard numbers is called, in the order the spec lists them. */
export const skorLabels: { key: "selesai" | "terlambat" | "keluhanUpheld" | "declines" | "rataPenilaian"; label: string }[] = [
  { key: "selesai", label: "Selesai" },
  { key: "terlambat", label: "Terlambat" },
  { key: "keluhanUpheld", label: "Keluhan upheld" },
  { key: "declines", label: "Declines / Tidak direspons" },
  { key: "rataPenilaian", label: "Rata-rata Penilaian" },
];

/** The scorecard's own title, with the window it covers. */
export function skorTitle(dari: Date, sampai: Date): string {
  return `Skor 90 hari (${formatPendek(dari)} – ${formatPendek(sampai)})`;
}

function formatPendek(instant: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }).format(instant);
}
