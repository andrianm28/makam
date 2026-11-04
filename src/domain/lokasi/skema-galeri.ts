/**
 * Galeri Lokasi categories, client-safe (no database): what a photo may show.
 * Facilities and landscape only; headstones and the burial area are never one.
 */
export const kategoriFotoGaleri = ["gerbang", "taman", "bangunan", "akses", "fasilitas_lain"] as const;
export type KategoriFotoGaleri = (typeof kategoriFotoGaleri)[number];

export const labelKategoriFotoGaleri: Record<KategoriFotoGaleri, string> = {
  gerbang: "Gerbang dan area depan",
  taman: "Taman dan lanskap",
  bangunan: "Bangunan (paviliun, musala, kantor)",
  akses: "Akses jalan dan parkir",
  fasilitas_lain: "Fasilitas lain",
};
