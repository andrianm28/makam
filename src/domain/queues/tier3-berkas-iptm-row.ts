/**
 * The two Tier 3 rows of a filing-only Pengurusan IPTM (spec, Work Queues: "TPU filing-only document check
 * (1 working day) and filing (3 working days after Lunas)"; ticket 47). Plain projections of the Pengurusan module's
 * own state, closing when the order moves on; the deadlines are the module's, on the Admin Platform calendar.
 */
import { barisPengurusan } from "./tier3-iptm-row";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const PERIKSA_BERKAS_IPTM_TYPE = "periksa_berkas_iptm";
export const AJUKAN_IPTM_BERKAS_TYPE = "ajukan_iptm_berkas";

/** Every document is in: Admin Platform checks them within 1 working day. */
export const periksaBerkasIptmRowType: AntreanRowType = {
  key: PERIKSA_BERKAS_IPTM_TYPE,
  tier: 3,
  label: "Periksa berkas IPTM",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    return (await deps.pengurusan.periksaBerkasTerbuka()).map(barisPengurusan);
  },
};

/** The Tagihan is Lunas: Admin Platform files within 3 working days. */
export const ajukanIptmBerkasRowType: AntreanRowType = {
  key: AJUKAN_IPTM_BERKAS_TYPE,
  tier: 3,
  label: "IPTM filing setelah Lunas",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    return (await deps.pengurusan.pengajuanBerkasTerbuka()).map(barisPengurusan);
  },
};
