/**
 * The publish gate (spec, Lokasi; decisions of 2026-09-26): a Lokasi Mitra may
 * become Terverifikasi only with a signed agreement (scan and date), a completed
 * Kunjungan Verifikasi, its tariffs checked and unchanged since, a saved Jam
 * Operasional and a Kontak Siaga. This computes the checklist from facts the
 * caller reads through each owning module's public queries.
 */

export interface PublishGateFacts {
  agreement: { signedOn: string | null; scanUploaded: boolean };
  kunjunganVerifikasiSelesai: boolean;
  /** The Tarif Diperiksa mark (Tariffs module), null until tariffs were checked. */
  tariffsChecked: { changedSinceCheck: boolean } | null;
  jamOperasionalDiisi: boolean;
  kontakSiagaDipilih: boolean;
}

export type PublishGateKey = "perjanjian" | "kunjungan_verifikasi" | "tarif_diperiksa" | "jam_operasional" | "kontak_siaga";

export type PublishGateItem =
  | { key: Exclude<PublishGateKey, "tarif_diperiksa">; met: boolean }
  | { key: "tarif_diperiksa"; met: boolean; tarifBerubahSejakDiperiksa?: true };

export interface PublishGate {
  /** True when every item is met. */
  ready: boolean;
  items: PublishGateItem[];
}

export function publishGate(facts: PublishGateFacts): PublishGate {
  const tarifBerubah = facts.tariffsChecked?.changedSinceCheck === true;
  const items: PublishGateItem[] = [
    { key: "perjanjian", met: facts.agreement.scanUploaded && facts.agreement.signedOn !== null },
    { key: "kunjungan_verifikasi", met: facts.kunjunganVerifikasiSelesai },
    tarifBerubah
      ? { key: "tarif_diperiksa", met: false, tarifBerubahSejakDiperiksa: true }
      : { key: "tarif_diperiksa", met: facts.tariffsChecked !== null },
    { key: "jam_operasional", met: facts.jamOperasionalDiisi },
    { key: "kontak_siaga", met: facts.kontakSiagaDipilih },
  ];
  return { ready: items.every((item) => item.met), items };
}

/**
 * The gate items Tayang Belum Terverifikasi needs (owner, 2026-11-05): Jam
 * Operasional and a Kontak Siaga a family can phone. The other items are
 * optional for that listing, still required to become Terverifikasi.
 */
export const syaratTayangBelumTerverifikasi = ["jam_operasional", "kontak_siaga"] as const satisfies readonly PublishGateKey[];
export type SyaratTayangBelumTerverifikasi = (typeof syaratTayangBelumTerverifikasi)[number];

/** Whether a gate item is required to be listed Belum Terverifikasi (false: optional there, required only to become Terverifikasi). */
export function wajibUntukTayangBelumTerverifikasi(key: PublishGateKey): boolean {
  return (syaratTayangBelumTerverifikasi as readonly PublishGateKey[]).includes(key);
}
