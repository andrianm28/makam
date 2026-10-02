import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * The page the PdfRenderer opens to print a Surat Kuasa. Headless Chromium has no session, so the
 * page is reachable only with a link signed for one Nomor Pemesanan and valid for a minute or two;
 * the same signature the PDF is made from is never the family's own link (that is a signed FileStore URL).
 */
const GELAR = "surat-kuasa-render";
export const SURAT_KUASA_RENDER_DETIK = 120;

/**
 * The link's own key, derived from AUTH_SECRET with HKDF and bound to this purpose, so a signature made for
 * FileStore URLs or session material can never pass here and this one never passes there. Derived once per
 * secret, here and nowhere else.
 */
const kunciTurunan = new Map<string, Buffer>();
function kunciLink(secret: string): Buffer {
  let kunci = kunciTurunan.get(secret);
  if (!kunci) {
    kunci = Buffer.from(hkdfSync("sha256", secret, "makam-v1", "makam/surat-kuasa-render/v1", 32));
    kunciTurunan.set(secret, kunci);
  }
  return kunci;
}

function tandatangani(secret: string, nomor: string, sampaiMs: number): string {
  return createHmac("sha256", kunciLink(secret)).update(`${GELAR}:${nomor}:${sampaiMs}`).digest("base64url");
}

/** The path and query of the render page for `nomor`, valid until `now` + 2 minutes. */
export function suratKuasaRenderPath(secret: string, nomor: string, now: Date): string {
  const sampai = now.getTime() + SURAT_KUASA_RENDER_DETIK * 1000;
  return `/pengurusan/${nomor}/surat-kuasa/render?sampai=${sampai}&tanda=${tandatangani(secret, nomor, sampai)}`;
}

/** Whether the query a render page received was signed for that `nomor` and has not expired. */
export function suratKuasaRenderSah(secret: string, nomor: string, query: { sampai?: string; tanda?: string }, now: Date): boolean {
  const sampai = Number(query.sampai);
  if (!Number.isSafeInteger(sampai) || sampai < now.getTime() || typeof query.tanda !== "string") return false;
  const harapan = Buffer.from(tandatangani(secret, nomor, sampai));
  const diterima = Buffer.from(query.tanda);
  return harapan.length === diterima.length && timingSafeEqual(harapan, diterima);
}
