/**
 * The pure rules of a Perpanjangan (spec, domain module 7): when it is open and
 * what a family is told when it is not. No database, no Clock: every case is a
 * plain unit test, and the module feeds it the facts.
 */
import { addWibDateMonths } from "@/lib/time/jakarta";

/**
 * "YYYY-MM-DD" plus `months` calendar months; a day the target month lacks becomes
 * that month's last day. The arithmetic lives in `@/lib/time/jakarta` with the other
 * WIB date helpers, so a Perpanjangan and a Paket Layanan cycle count months the
 * same way.
 */
export const tambahBulan = addWibDateMonths;

/** How many months before the end date a Perpanjangan opens. */
export const BULAN_SEBELUM_BERAKHIR = 3;

/** Why a family is not offered a Perpanjangan button, as the note that replaces it. */
export type CatatanPerpanjangan =
  /** "berlaku selamanya": a perpetual Hak Pakai has nothing to extend. */
  | { kind: "selamanya" }
  /** "bisa diperpanjang mulai <tanggal>". */
  | { kind: "terlalu_awal"; mulaiPada: string }
  /** "hubungi Admin Lokasi": Berakhir, Dibatalkan, past the Masa Tenggang, or a Hak Pakai the platform cannot read yet. */
  | {
      kind: "hubungi_admin_lokasi";
      sebab: "berakhir" | "dibatalkan" | "lewat_masa_tenggang" | "perlu_verifikasi" | "tanggal_belum_tercatat" | "tidak_ditemukan";
    }
  /** "Lunasi Tagihan TGH/... terlebih dahulu", with a pay link. */
  | { kind: "lunasi_tagihan"; nomorTagihan: string; link: string };

export interface FaktaHakPakai {
  status: "aktif" | "kedaluwarsa" | "berakhir" | "dibatalkan";
  tenureYears: number | null;
  endDate: string | null;
  perluVerifikasi: boolean;
}

/**
 * Whether a Perpanjangan is open today (WIB date), or the note that replaces the
 * button. Open from 3 months before the end date to the end of the Masa
 * Tenggang, both days included. The order of the checks is the order a family
 * should hear the reason in: ended first, then perpetual, then the Admin Lokasi's
 * own to-do, then timing.
 */
export function bolehDiperpanjang(
  hak: FaktaHakPakai,
  hariIni: string,
  masaTenggangMonths: number,
): { boleh: true; dibukaSejak: string; masaTenggangBerakhir: string } | { boleh: false; catatan: CatatanPerpanjangan } {
  if (hak.status === "berakhir") return { boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "berakhir" } };
  if (hak.status === "dibatalkan") return { boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "dibatalkan" } };
  if (hak.tenureYears === null) return { boleh: false, catatan: { kind: "selamanya" } };
  if (hak.perluVerifikasi) return { boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "perlu_verifikasi" } };
  if (hak.endDate === null) return { boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "tanggal_belum_tercatat" } };
  const dibukaSejak = tambahBulan(hak.endDate, -BULAN_SEBELUM_BERAKHIR);
  const masaTenggangBerakhir = tambahBulan(hak.endDate, masaTenggangMonths);
  if (hariIni < dibukaSejak) return { boleh: false, catatan: { kind: "terlalu_awal", mulaiPada: dibukaSejak } };
  if (hariIni > masaTenggangBerakhir) return { boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "lewat_masa_tenggang" } };
  return { boleh: true, dibukaSejak, masaTenggangBerakhir };
}

/** "a***@contoh.id": enough for the family to recognise the address, not to read it. */
export function samarkanEmail(email: string): string {
  const [lokal, domain] = email.split("@");
  return `${lokal.slice(0, 1)}***@${domain}`;
}
