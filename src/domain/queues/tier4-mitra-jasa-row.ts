/**
 * The Antrean's two Tier 4 rows about Mitra Jasa (spec, Work Queues: "Tier 4:
 * Mitra Jasa onboarding; monthly scorecard review"; story 155 and 159's
 * management side; ticket 55).
 *
 * Both are projections of the Layanan module's own state, read through its public
 * interface: the onboarding row while a record is missing one of its nine steps,
 * and the scorecard review row while this month's review row is open. Neither
 * alerts (Tier 4 never does) and neither is created by hand.
 *
 * What a Mitra Jasa may see of this is nothing: the Antrean is Admin Platform's
 * (`antrean.lihat`), so both queries return nothing for any other role before they
 * read a single row.
 */
import { addWibDays, wib } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/**
 * How long a Mitra Jasa record has to be finished once it is created. Spec gives
 * the row no SLA of its own; a week is in line with this tier's other windows
 * (7 days for the publish-gate recheck, 14 for a stale TPU flag).
 */
export const MITRA_JASA_ONBOARDING_GRACE_DAYS = 7;

/** How long Admin Platform has, from the first of a month, to review that month's scorecard. */
export const SKOR_MITRA_JASA_REVIEW_GRACE_DAYS = 7;

const mitraJasaHref = (mitraJasaId: string) => `/staf/admin-platform/mitra-jasa/${mitraJasaId}`;

/**
 * Open while a Mitra Jasa's onboarding record is missing one of its nine steps
 * (KTP, NIK, photo, home area, the arrangement scan, the bank account, and both
 * coverage lists): until then it takes no work, so a complete record is what
 * closes this row.
 */
export const mitraJasaOnboardingRowType: AntreanRowType = {
  key: "mitra_jasa_onboarding",
  tier: 4,
  label: "Onboarding Mitra Jasa",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const belum = await deps.layanan.mitraJasaBelumLengkap(by);
    return belum.map((satu) => ({
      subjectKind: "mitra_jasa",
      subjectId: satu.id,
      subjectLabel: satu.namaLengkap,
      href: mitraJasaHref(satu.id),
      deadline: addWibDays(satu.dibuatPada, MITRA_JASA_ONBOARDING_GRACE_DAYS),
    }));
  },
};

/**
 * Open while this month's scorecard review row is unreviewed (spec: "monthly
 * scorecard review"). The tick opens one row per Mitra Jasa on the first of the WIB
 * month, so the row is due from the 7th; recording the review closes it by itself.
 */
export const skorMitraJasaReviewRowType: AntreanRowType = {
  key: "mitra_jasa_skor_bulanan",
  tier: 4,
  label: "Tinjauan skor Mitra Jasa",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const terbuka = await deps.layanan.tinjauanTerbuka(by);
    return terbuka.map((satu) => ({
      subjectKind: "mitra_jasa",
      subjectId: satu.mitraJasaId,
      subjectLabel: `${satu.namaLengkap} — ${satu.bulan}`,
      href: mitraJasaHref(satu.mitraJasaId),
      deadline: addWibDays(wib(`${satu.bulan}-01`), SKOR_MITRA_JASA_REVIEW_GRACE_DAYS),
    }));
  },
};
