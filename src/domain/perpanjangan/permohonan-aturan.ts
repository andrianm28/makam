/**
 * Who may file a manual request for a Hak Pakai and when (ticket 41): the same blocks as the direct
 * path, the paths that fit the holder on record, and the due instant of a filed request.
 */
import { addWorkingDays } from "@/domain/lokasi";
import { wibDateOf } from "@/lib/time/jakarta";
import { bolehDiperpanjang, type CatatanPerpanjangan } from "./aturan";
import { labelPetak, tidakAdaYangDiperpanjang, type Pemohon } from "./ajukan";
import type { PerpanjanganDeps } from "./deps";
import { TENGGAT_PERIKSA_HARI_KERJA, type JalurManual } from "./permohonan-skema";

export async function akunDari(deps: PerpanjanganDeps, pemohon: Pemohon): Promise<boolean> {
  const akun = await deps.identity.accountByEmail(pemohon.email);
  return akun !== null && akun.id === pemohon.accountId;
}

export /**
 * Whether a manual request may be filed for this Hak Pakai now: the same blocks as the direct path
 * (perpetual, Berakhir, Dibatalkan, too early, past the Masa Tenggang, an overdue Tagihan), except that
 * a Hak Pakai flagged Perlu Verifikasi is exactly what the Admin Lokasi completes in the review.
 */
async function faktaManual(deps: PerpanjanganDeps, hakPakaiId: string) {
  const tidakDitemukan = { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  if (!hak) return tidakDitemukan;
  const aturan = await deps.lokasi.aturanPerpanjanganOf(hak.lokasiId);
  if (!aturan) return tidakDitemukan;
  const hariIni = wibDateOf(deps.clock.now());
  // A flagged Hak Pakai with no end date cannot be placed in its window yet: the review supplies the date.
  const tanpaTanggal = hak.perluVerifikasi && hak.endDate === null && hak.tenureYears !== null;
  const boleh = tanpaTanggal ? null : bolehDiperpanjang({ ...hak, perluVerifikasi: false }, hariIni, aturan.masaTenggangMonths);
  if (boleh && !boleh.boleh && tidakAdaYangDiperpanjang(boleh.catatan)) return { ok: false as const, catatan: boleh.catatan };
  if (hak.tenureYears === null) return { ok: false as const, catatan: { kind: "selamanya" } satisfies CatatanPerpanjangan };
  const penghalang = await deps.pemesanan.tagihanPenghalangOf(hak.id);
  if (penghalang) return { ok: false as const, catatan: { kind: "lunasi_tagihan", nomorTagihan: penghalang.nomorTagihan, link: penghalang.link } satisfies CatatanPerpanjangan };
  if (boleh && !boleh.boleh) return { ok: false as const, catatan: boleh.catatan };
  return { ok: true as const, hak, aturan };
}

/** Whether a manual request can be filed for this Hak Pakai now, and by which paths, or the note that replaces the form. */
export type StatusManual =
  | { boleh: true; hakPakaiId: string; lokasiName: string; petakNomor: string; jalurTersedia: JalurManual[] }
  | { boleh: false; catatan: CatatanPerpanjangan };

export async function statusManual(deps: PerpanjanganDeps, hakPakaiId: string): Promise<StatusManual> {
  const dasar = await faktaManual(deps, hakPakaiId);
  if (!dasar.ok) return { boleh: false, catatan: dasar.catatan };
  return { boleh: true, hakPakaiId: dasar.hak.id, lokasiName: dasar.aturan.name, petakNomor: labelPetak(dasar.hak), jalurTersedia: jalurTersedia(dasar.hak) };
}

/** A claim is for a Hak Pakai with no Pemegang Hak on record; a KTP or an heir needs one on record. */
export function jalurTersedia(hak: { pemegangHak: { name: string | null } | null }): JalurManual[] {
  return hak.pemegangHak?.name ? ["ktp", "ahli_waris"] : ["klaim"];
}

export /** The due instant of a request filed at `now`: 2 working days on the Lokasi's calendar, or null while the calendar is empty. */
async function tenggatOf(deps: PerpanjanganDeps, lokasiId: string, now: Date): Promise<Date | null> {
  const jam = await deps.lokasi.jamOperasionalOf(lokasiId);
  if (!jam.ok) return null;
  const tenggat = addWorkingDays(jam.jamOperasional, now, TENGGAT_PERIKSA_HARI_KERJA);
  return tenggat.ok ? tenggat.at : null;
}
