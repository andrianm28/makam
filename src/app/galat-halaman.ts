/** Client-safe wording and decisions for the error pages (`error.tsx`, `global-error.tsx`). */

export interface GalatHalaman {
  kind: "diperbarui" | "umum";
  heading: string;
  body: string;
  /** Whether the error goes to GlitchTip; a stale action is the site's own update, not a fault. */
  report: boolean;
  showBeranda: boolean;
}

/** Fallback when Next's `unstable_isUnrecognizedActionError` does not recognise the error. */
export function isStaleActionByName(error: unknown): boolean {
  return error instanceof Error && error.name === "UnrecognizedActionError";
}

export function galatHalaman(staleAction: boolean): GalatHalaman {
  if (staleAction) {
    return {
      kind: "diperbarui",
      heading: "Halaman diperbarui",
      body: "Situs baru saja diperbarui, jadi formulir di halaman ini perlu dimuat ulang. Isian Anda belum terkirim. Muat ulang halaman, lalu coba lagi.",
      report: false,
      showBeranda: false,
    };
  }
  return {
    kind: "umum",
    heading: "Terjadi kesalahan",
    body: "Halaman ini tidak bisa ditampilkan. Silakan muat ulang, atau kembali ke beranda.",
    report: true,
    showBeranda: true,
  };
}
