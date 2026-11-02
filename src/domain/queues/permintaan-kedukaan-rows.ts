/**
 * The Permintaan Kedukaan rows (ADR 0010): a family waiting for the Operator's first call. Each is a
 * plain projection of the Kedukaan module's open requests, so it closes itself the moment the
 * request leaves Diajukan. The jenis decides the tier and the deadline the module already set:
 *
 * - Tier 1 "Permintaan Kedukaan mendesak": Rumah Duka, Mobil Jenazah, Cargo, Repatriasi (30 minutes; alerts);
 * - Tier 2 "Permintaan Kedukaan": Peti Jenazah, Bunga Duka Cita (2 hours);
 * - Tier 3 "Konsultasi Rencana Pemakaman" (one Hari Kerja; no alert).
 */
import { labelJenisKedukaan, urgensiKedukaan, type PermintaanKedukaanTerbuka } from "@/domain/kedukaan";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow, Tier1Row, Tier1RowDeps, Tier1RowType } from "./row-types";

export const PERMINTAAN_KEDUKAAN_HREF = "/staf/admin-platform/kedukaan";

function baris(satu: PermintaanKedukaanTerbuka): RawAntreanRow {
  return {
    subjectKind: "permintaan_kedukaan",
    subjectId: satu.id,
    subjectLabel: `${satu.nomor} · ${labelJenisKedukaan[satu.jenis]} · ${satu.nama} · ${satu.kabKota}`,
    href: `${PERMINTAAN_KEDUKAAN_HREF}/${satu.id}`,
    deadline: satu.tenggatPada,
  };
}

async function terbukaDiTier(deps: Pick<AntreanRowDeps, "kedukaan">, tier: 1 | 2 | 3): Promise<PermintaanKedukaanTerbuka[]> {
  const semua = (await deps.kedukaan?.terbuka()) ?? [];
  return semua.filter((satu) => urgensiKedukaan[satu.jenis].tier === tier);
}

/** The minutes a Tier 1 Permintaan was given for its first call, to recover when the row appeared. */
const MENIT_TIER_1 = 30;

export const permintaanKedukaanMendesakRowType: Tier1RowType = {
  key: "permintaan_kedukaan_mendesak",
  tier: 1,
  label: "Permintaan Kedukaan mendesak",
  async rows(deps: Tier1RowDeps): Promise<Tier1Row[]> {
    return (await terbukaDiTier(deps, 1)).map((satu) => ({
      ...baris(satu),
      // The row appears when the family files; the deadline is 30 minutes after that.
      sejak: new Date(satu.tenggatPada.getTime() - MENIT_TIER_1 * 60_000),
    }));
  },
};

export const permintaanKedukaanRowType: AntreanRowType = {
  key: "permintaan_kedukaan",
  tier: 2,
  label: "Permintaan Kedukaan",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    return (await terbukaDiTier(deps, 2)).map(baris);
  },
};

export const konsultasiRencanaPemakamanRowType: AntreanRowType = {
  key: "konsultasi_rencana_pemakaman",
  tier: 3,
  label: "Konsultasi Rencana Pemakaman",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    return (await terbukaDiTier(deps, 3)).map(baris);
  },
};
