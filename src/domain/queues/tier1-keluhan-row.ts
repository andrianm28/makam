/**
 * Tier 1 "Keluhan" (spec, Work Queues: "Tier 1: … Keluhan (first response in 4 daytime
 * hours, i.e. 06:00–18:00 WIB, decided within the window)"; story 158; ticket 51): a
 * Pemesan who says a finished Pekerjaan Layanan was not done right, which Admin Platform
 * answers and then decides — a redo, a refund or a rejection.
 *
 * The row is a plain projection of the Layanan module's own list of Keluhan waiting for a
 * decision, so it closes itself the moment Admin Platform decides, and a Keluhan nobody has
 * decided stays a row however old it is. Its deadline is the first response, 4 **daytime**
 * hours after the Keluhan was filed (`responPertamaDueAt`, counted by `daytimeHoursDeadline`
 * when it was filed): a Keluhan filed at 17:00 is due at 09:00 the next morning, not at 21:00
 * when nobody is awake to answer it.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const KELUHAN_ROW_TYPE = "keluhan_layanan";

export const keluhanRowType: AntreanRowType = {
  key: KELUHAN_ROW_TYPE,
  tier: 1,
  label: "Keluhan",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = await deps.layanan.keluhanTerbuka();
    return terbuka.map((satu) => ({
      subjectKind: "keluhan_layanan",
      subjectId: satu.id,
      subjectLabel: `${satu.lokasi.name} · ${satu.pesanan} · ${satu.petak} · ${satu.label}`,
      href: `/staf/admin-platform/keluhan/${satu.id}`,
      deadline: satu.responPertamaDueAt,
    }));
  },
};
