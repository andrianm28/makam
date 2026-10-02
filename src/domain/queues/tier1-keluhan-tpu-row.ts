/**
 * Tier 1 "Keluhan" for a TPU job (spec, Work Queues: "Tier 1: … Keluhan (first response in 4 daytime hours …)";
 * story 158; ticket 57): a Pemesan who says a finished TPU job was not done right, which Admin Platform answers
 * and then decides, a redo or a rejection. Like the Keluhan row of a Lokasi Mitra job (ticket 51) it is a plain
 * projection of the Layanan module's list of Keluhan waiting for a decision, due 4 daytime hours after it was
 * filed, alerting the Bertugas Admin Platform with its clocks counted from the filing.
 */
import type { Tier1Row, Tier1RowDeps, Tier1RowType } from "./row-types";

export const KELUHAN_TPU_ROW_TYPE = "keluhan_layanan_tpu";

export const keluhanTpuRowType: Tier1RowType = {
  key: KELUHAN_TPU_ROW_TYPE,
  tier: 1,
  label: "Keluhan pekerjaan TPU",
  async rows(deps: Tier1RowDeps): Promise<Tier1Row[]> {
    const terbuka = await deps.layanan.keluhanTpuTerbukaAntrean();
    return terbuka.map((satu) => ({
      subjectKind: "keluhan_layanan_tpu",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.label} · ${satu.tpuName}`,
      href: `/staf/admin-platform/keluhan-tpu/${satu.id}`,
      deadline: satu.responPertamaDueAt,
      sejak: satu.diajukanAt,
    }));
  },
};
