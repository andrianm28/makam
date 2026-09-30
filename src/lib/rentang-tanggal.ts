/** A half-open span of WIB calendar dates ("YYYY-MM-DD"): `dari` is inside, `sampai` is not. Shared by the modules the Laporan reads (ticket 33). */
export interface RentangTanggal {
  dari: string;
  sampai: string;
}

/** How long the link to an uploaded transfer proof works when the Laporan's weekly list opens it: a few minutes, as everywhere a private file is opened. */
export const BUKTI_TRANSFER_URL_DETIK = 5 * 60;
