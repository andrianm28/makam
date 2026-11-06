/**
 * The documents a family chose on "Data & kirim" before its order existed
 * (rapat Ira, 6 Nov 2026: KTP Almarhum, Kartu Keluarga and KTP Pemesan are
 * attached in the order form, before Kirim). A Server Action request carries
 * at most 11 MB, so the files do not ride along with Kirim: they wait here,
 * in the browser tab's own memory, and the order page the wizard lands on
 * uploads them one by one with the ordinary family upload. A reload loses
 * them, and the order page then asks for them like any missing document.
 * Never written to storage of any kind: these are family documents.
 */
export interface BerkasTertunda {
  /** The checklist item, exactly as the Lokasi Mitra wrote it. */
  nama: string;
  file: File;
}

let tertunda: { lokasiId: string; berkas: BerkasTertunda[] } | null = null;

/** Keeps the chosen documents for the order about to be placed at this Lokasi Mitra. */
export function simpanBerkasTertunda(lokasiId: string, berkas: BerkasTertunda[]): void {
  tertunda = berkas.length > 0 ? { lokasiId, berkas } : null;
}

/** Hands the waiting documents over once, and forgets them. */
export function ambilBerkasTertunda(): BerkasTertunda[] {
  const berkas = tertunda?.berkas ?? [];
  tertunda = null;
  return berkas;
}
