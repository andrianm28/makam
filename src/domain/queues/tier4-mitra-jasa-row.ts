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
 *
 * **Both rows carry no deadline, and that is the spec's own silence rather than an
 * oversight.** The Tier 4 line (`spec.md:527`) writes a window for the row beside
 * it — "TPU flag stale for 14 days" — and writes none for these two: "Mitra Jasa
 * onboarding; monthly scorecard review". Every other tier names its own, down to
 * "IPTM filing (7 days)". So `deadline` is `null` here, which `RawAntreanRow`
 * defines as a row with no deadline: the row still opens and closes on state, sorts
 * last inside Tier 4, and is never late. A number would be a business rule with no
 * source, and the source is the owner's to write (see ticket 55's `## Comments`).
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

const mitraJasaHref = (mitraJasaId: string) => `/staf/admin-platform/mitra-jasa/${mitraJasaId}`;

/**
 * Open while a Mitra Jasa's onboarding record is missing one of its nine steps
 * (KTP, NIK, photo, home area, the arrangement scan, the bank account, and both
 * coverage lists): until then it takes no work, so a complete record is what
 * closes this row. No deadline: the spec gives this row no window.
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
      deadline: null,
    }));
  },
};

/**
 * Open while this month's scorecard review row is unreviewed (spec: "monthly
 * scorecard review"). The tick opens one row per Mitra Jasa on the first of the WIB
 * month; recording the review closes it by itself. No deadline: the spec gives
 * this row no window, so none is invented here.
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
      deadline: null,
    }));
  },
};
