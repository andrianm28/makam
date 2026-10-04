import { z } from "zod";

/**
 * Asks the running server whether payments are a trial (ticket 101) and whether Data Contoh is
 * active (ticket 109), through `/api/browser-config`: a runtime answer, because one image serves
 * staging and production and statically rendered pages cannot read the environment. Any failure
 * reads as "not a trial" and "no Data Contoh", so the banner stays hidden rather than guess.
 */
const browserConfigSchema = z.object({ paymentTrial: z.boolean(), contohAktif: z.unknown().optional() });

export interface BrowserTrial {
  paymentTrial: boolean;
  /** Whether the registry holds an active Data Contoh entry; only a literal `true` counts (an older server sends none, a failed read sends null). */
  contohAktif: boolean;
}

const TIDAK: BrowserTrial = { paymentTrial: false, contohAktif: false };

export async function fetchBrowserTrial(fetcher: typeof fetch = fetch): Promise<BrowserTrial> {
  try {
    const response = await fetcher("/api/browser-config", { cache: "no-store" });
    if (!response.ok) return TIDAK;
    const body: unknown = await response.json();
    const parsed = browserConfigSchema.safeParse(body);
    return parsed.success ? { paymentTrial: parsed.data.paymentTrial, contohAktif: parsed.data.contohAktif === true } : TIDAK;
  } catch {
    return TIDAK;
  }
}

export async function fetchPaymentTrial(fetcher: typeof fetch = fetch): Promise<boolean> {
  return (await fetchBrowserTrial(fetcher)).paymentTrial;
}

/** The trial banner's first line (ticket 101). */
export const BARIS_PEMBAYARAN_UJI_COBA = "PEMBAYARAN UJI COBA — pembayaran di Makam.co.id saat ini masih percobaan, tidak ada uang yang berpindah.";

/** The line added under it while Data Contoh is active (ticket 109): the wording the owner confirms. */
export const BARIS_DATA_CONTOH = "Data bertanda (Contoh) dan harganya adalah contoh; pesanan masa uji coba tidak dilayani sungguhan.";

/** The lines the banner shows: none unless payments are a trial; the Data Contoh line only while Data Contoh is active. */
export function barisBanner(trial: BrowserTrial): string[] {
  if (!trial.paymentTrial) return [];
  return trial.contohAktif ? [BARIS_PEMBAYARAN_UJI_COBA, BARIS_DATA_CONTOH] : [BARIS_PEMBAYARAN_UJI_COBA];
}
