/**
 * The TPU section of the Saat Duka "Pilih makam" list (spec, story 19: a TPU
 * section below the Lokasi Mitra cards, "dimakamkan lewat Pengurusan", listing
 * only TPUs taking new plots, and a type chip over the combined list).
 *
 * Every TPU on that list is priced the same way, so the quote is taken once and
 * travels on each card: the burial Biaya Pengurusan and the Retribusi Pemda as
 * its own line, and no Biaya Layanan Platform, which belongs to a Lokasi Mitra
 * order alone. The TPU list and its new-plot flag are the Lokasi module's data,
 * read here through its public functions.
 */
import { daytimeHoursDeadline, isOpenAt, TPU_SCHEDULE, type PublicTpuDki, type WorkingTimeResult } from "@/domain/lokasi";
import type { AllInPrice, QuoteLine } from "@/domain/tariffs";
import type { PengurusanDeps } from "./deps";

/**
 * The Saat Duka TPU confirmation promise (spec, Pengurusan): two service hours
 * on the fixed TPU window, 06:00–18:00 WIB, so a submission at 23:00 is
 * confirmed by 08:00 the next morning. The hours are counted by Lokasi's
 * working-time calculator (ticket 11), never counted here.
 */
export const JAM_KONFIRMASI_TPU = 2;

/** The two lines a Saat Duka TPU order is made of: the Operator's fee for arranging the burial, and the town's own charge for the IPTM. */
const burialLines: readonly QuoteLine[] = [
  { kind: "biaya_pengurusan", pengurusan: "pemakaman" },
  { kind: "retribusi_pemda", retribusi: "iptm" },
];

/** One TPU a Pemesan may choose: how the grave is made there, for the same price at every TPU. */
export interface KartuTpu {
  tpu: { id: string; name: string; city: string; address: string };
  /** The all-in total this order would carry: Biaya Pengurusan + Retribusi Pemda, with no Biaya Layanan Platform. */
  harga: AllInPrice;
  /**
   * The confirmation promise on the fixed TPU window: whether 06:00–18:00 WIB is
   * open at the Clock's now, and the instant the Operator confirms by (two
   * service hours). A TPU window never has a day closed, so `batas` always
   * answers; it keeps the calculator's own refusal type in case that changes.
   */
  konfirmasi: { bukaSekarang: boolean; batas: WorkingTimeResult };
}

export interface PilihanSaatDukaTpuQuery {
  /** Exact kota / kabupaten; every city when none is given ("Semua kota"), the same filter the Lokasi Mitra cards use. */
  city?: string;
  /** Only this TPU ("Data & kirim" prices the choice again, as the Lokasi Mitra card does). */
  tpuId?: string;
}

/**
 * Every DKI TPU that is taking new plots, by name: a TPU whose flag is off holds
 * no plot to give, so it is never offered a burial. Filtered by the same city
 * the Lokasi Mitra list filters by, and narrowed to one TPU for the submission
 * screen. No actor: this is the wizard's own read.
 */
export async function pilihanSaatDukaTpu(deps: PengurusanDeps, query: PilihanSaatDukaTpuQuery = {}): Promise<KartuTpu[]> {
  const at = deps.clock.now();
  // One TPU for the submission screen (a `tpu_dki` that names nothing is no card), else the list by city.
  const semua = query.tpuId ? [await deps.lokasi.publicTpuDki(query.tpuId)] : await deps.lokasi.publicTpuDkiList(query.city ? { city: query.city } : {});
  // A TPU that is not taking new plots holds no plot to give, so it is never offered a burial.
  const baru = semua.filter((satu): satu is PublicTpuDki => satu !== null && satu.newPlot);
  if (baru.length === 0) return [];
  // One quote for the whole section: every TPU carries the same two lines, and a
  // price no Tagihan could carry is no card at all.
  const quoted = await deps.tariffs.quote(burialLines, at);
  if (!quoted.ok) return [];
  const harga: AllInPrice = {
    total: quoted.total,
    lines: quoted.lines,
    inForceSince: quoted.inForceSince,
    scheduledChange: quoted.scheduledChange,
  };
  const konfirmasi = { bukaSekarang: isOpenAt(TPU_SCHEDULE, at), batas: batasTpu(at) };
  return baru.map((satu) => ({ tpu: { id: satu.id, name: satu.name, city: satu.city, address: satu.address }, harga, konfirmasi }));
}

/**
 * The instant a submission now is confirmed by: two service hours counted inside
 * the fixed TPU window. Wrapped in the calculator's own answer type, so a card
 * reads the same whether the window could answer or not.
 */
function batasTpu(at: Date): WorkingTimeResult {
  return { ok: true, at: daytimeHoursDeadline(at, JAM_KONFIRMASI_TPU) };
}
