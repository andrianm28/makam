/**
 * Scheduler module.
 *
 * Owns the tick registry: every recurring piece of worker behaviour is a
 * domain tick function `tick(ctx, now)` that takes "now" from the Clock and
 * acts on the database state due at that time. The `worker` process is only
 * a thin pg-boss wrapper around these ticks, so a restart never loses a timer
 * (story 186) and tests call ticks directly with the fake Clock.
 *
 * Every tick must be idempotent: running it twice for the same `now` is harmless.
 *
 * Owns table: scheduler_heartbeat.
 */
import type { Database } from "@/db/client";
import { lapsePayFirstTagihanTick, lewatJatuhTempoPayAfterTagihanTick, retryFailedPaymentEffectsTick, type PaymentEffect } from "@/domain/billing";
import { pruneIpRequests } from "@/domain/identity";
import { pruneCariMakamAttempts, type Inventory } from "@/domain/inventory";
import { jadwalkanTertunda, tandaiTerlambat, type Layanan } from "@/domain/layanan";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import { catatPemakamanTick, realertKonfirmasiSaatDukaTick } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { QueuesTicks } from "@/domain/queues";
import type { Refunds } from "@/domain/refunds";
import type { ReportError } from "@/lib/observability/report-error";
import { readHeartbeat, recordHeartbeat, type WorkerHeartbeat } from "./heartbeat";

export { HEARTBEAT_FRESH_FOR_SECONDS, type WorkerHeartbeat } from "./heartbeat";

/**
 * What every tick is given: the database, plus what some ticks need from the
 * composition (built once for the worker in src/composition/scheduler.ts).
 */
export interface SchedulerContext {
  db: Database;
  /** The downstream effects of a payment (src/composition/billing.ts), for re-running failed ones. */
  paymentEffects: readonly PaymentEffect[];
  reportError: ReportError;
  /** Family messages due, sent through the worker (ticket 20), and the Chasing escalation tick (ticket 29). */
  notifications: Pick<Notifications, "kirimPesanJatuhTempo" | "chasingEskalasiTick" | "kirimPeringatanAntreanTick" | "kirimPeringatanStafTick">;
  /**
   * Whether a queued direct Peringatan Staf's subject still needs it (ticket 96),
   * answered by the module that owns the subject. Omitted: Notifications has no
   * one to ask and a retry goes out.
   */
  peringatanStafSubjek?: (subject: { kind: string; id: string }) => Promise<boolean>;
  /** The Pemesanan module's own reads and announcements: the Saat Duka re-alert (ticket 23) and the "Catat Pemakaman" prompt (ticket 25). */
  pemesanan: Parameters<typeof realertKonfirmasiSaatDukaTick>[0];
  /**
   * The Payouts module's own ticks: the Saat Duka Pencairan trigger (Lunas **and**
   * Pemakaman recorded, in either order) and the 60-day Potongan ageing (ticket 32).
   */
  payouts: Pick<Payouts, "tick" | "tickPotongan">;
  /**
   * The Pemesanan module's own tick for a Pemesanan Terencana whose payment hold ran out unpaid
   * (ticket 37): the order becomes Dibatalkan and its plots are released.
   */
  terencana: Pick<Pemesanan, "lewatBatasBayarTick">;
  /** Refunds' own materialising tick: every Tagihan Billing flagged for a refund becomes a request here (ticket 31). */
  refunds: Pick<Refunds, "tick">;
  /** The Layanan module's own ticks: the monthly Mitra Jasa scorecard review row (ticket 55), the Keluhan window closing (ticket 51), the TPU accept deadline (ticket 56) and the Paket Layanan cycles (ticket 54). */
  layanan: Pick<Layanan, "tinjauSkorTick" | "tandaiTidakDirespons" | "tutupJendelaKeluhan" | "paketSiklusTick" | "batalkanPekerjaanTagihanLapse">;
  /** The Antrean's own ticks: Tier 1 alerts and their escalation, and the Bertugas auto-off (ticket 28). */
  queues: QueuesTicks;
  /** A grave's Hak Pakai, which is what holds a job back until the Admin Lokasi completes it (ticket 50). */
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
}

export type TickFunction = (ctx: SchedulerContext, now: Date) => Promise<void>;

export interface ScheduledTick {
  /** pg-boss queue name. */
  name: string;
  /** Cron expression, evaluated in Asia/Jakarta. */
  cron: string;
  tick: TickFunction;
}

/** The worker's heartbeat tick: proves the scheduler is alive. */
export async function heartbeatTick(ctx: { db: Database }, now: Date): Promise<void> {
  await recordHeartbeat(ctx.db, now);
}

/** The worker's last heartbeat as seen at `now`; fresh while younger than `HEARTBEAT_FRESH_FOR_SECONDS`. */
export async function workerHeartbeat(ctx: { db: Database }, now: Date): Promise<WorkerHeartbeat> {
  return readHeartbeat(ctx.db, now);
}

/**
 * Every tick the worker schedules. Later tickets add theirs here (hold expiry,
 * reminders, Antrean escalations, Pencairan due, ...).
 */
export const scheduledTicks: readonly ScheduledTick[] = [
  { name: "scheduler.heartbeat", cron: "* * * * *", tick: heartbeatTick },
  // Identity & Access: per-IP request records for emailed codes older than 24 h (ticket 67).
  { name: "identity.prune_ip_requests", cron: "17 * * * *", tick: pruneIpRequestsTick },
  // Inventory: the Makam keluarga hub's per-IP lookup attempts older than 24 h (ticket 34).
  { name: "inventory.prune_cari_makam_attempts", cron: "23 * * * *", tick: pruneCariMakamAttemptsTick },
  // Billing: unpaid pay-first Tagihan lapse to Dibatalkan at their due date (ticket 18).
  { name: "billing.lapse_pay_first_tagihan", cron: "* * * * *", tick: lapsePayFirstTagihanTick },
  // Billing: a pay-after Tagihan whose recorded burial has passed its window becomes Lewat Jatuh Tempo (ticket 25).
  { name: "billing.lewat_jatuh_tempo_pay_after", cron: "* * * * *", tick: lewatJatuhTempoPayAfterTagihanTick },
  // Billing: a downstream effect of a payment that failed is run again (ticket 19).
  { name: "billing.retry_payment_effects", cron: "*/10 * * * *", tick: retryFailedPaymentEffectsTick },
  // Notifications: queued family messages whose time has come are sent (ticket 20).
  { name: "notifications.kirim_pesan", cron: "* * * * *", tick: kirimPesanTick },
  // Notifications: a Tagihan still Lewat Jatuh Tempo at H+1 gets its call row opened and its Lokasi pushed (ticket 29).
  { name: "notifications.chasing_eskalasi", cron: "* * * * *", tick: chasingEskalasiTick },
  // Pemesanan: a Saat Duka order still unconfirmed an hour of service time later is alerted again (ticket 23).
  { name: "pemesanan.realert_saat_duka", cron: "* * * * *", tick: realertSaatDukaTick },
  // Pemesanan: a confirmed Terencana order whose payment hold ended unpaid is cancelled and its plots released (ticket 37).
  { name: "pemesanan.lewat_batas_bayar_terencana", cron: "* * * * *", tick: lewatBatasBayarTerencanaTick },
  // Payouts: an order whose Tagihan is Lunas and whose Pemakaman is recorded gets its Pencairan items (ticket 32);
  // a paid Pemesanan Terencana gets its Hak Pakai item at the end of its Masa Pembatalan (ticket 37).
  { name: "payouts.pencairan_due", cron: "* * * * *", tick: pencairanDueTick },
  // Payouts: a Potongan 60 days old becomes an offline request (ticket 32).
  { name: "payouts.potongan_usia", cron: "23 2 * * *", tick: potonganUsiaTick },
  // Pemesanan: the day after a burial it agreed, the Lokasi is asked to record it (ticket 25).
  { name: "pemesanan.catat_pemakaman", cron: "* * * * *", tick: catatPemakamanPromptTick },
  // Refunds: every Tagihan Billing flagged for a refund becomes a request here (ticket 31).
  { name: "refunds.materialise", cron: "* * * * *", tick: refundsMaterialiseTick },
  // Layanan: the first of each WIB month opens one scorecard review row per Mitra Jasa (ticket 55).
  { name: "layanan.tinjau_skor_mitra_jasa", cron: "13 5 1 * *", tick: tinjauSkorTick },
  // Layanan: a job past its target date with no proof is flagged Terlambat, which raises the Admin Lokasi's and Admin Platform's rows (ticket 50).
  { name: "layanan.tandai_terlambat", cron: "7 * * * *", tick: terlambatTick },
  // Layanan: a job the Hak Pakai gate held is scheduled now that its Hak Pakai is complete (ticket 50).
  { name: "layanan.jadwalkan_tertunda", cron: "9 * * * *", tick: jadwalkanTertundaTick },
  // Layanan: a TPU job assigned to a Mitra Jasa who has not answered by the accept deadline (12 h, or H-1 18:00 when
  // sooner) counts as Tidak direspons and returns to the queue (ticket 56). Every 5 minutes: the deadline is a clock time.
  { name: "layanan.tandai_tidak_direspons", cron: "*/5 * * * *", tick: tidakDiresponsTick },
  // Layanan: a job's Keluhan window closes 3×24 h after its proof was shown, which makes its Pencairan due and closes its thread (ticket 51).
  { name: "layanan.tutup_jendela_keluhan", cron: "*/5 * * * *", tick: tutupJendelaKeluhanTick },
  // Layanan: each Paket Layanan subscription's next cycle is issued at H-7 (ticket 54).
  // Layanan: the jobs of a lapsed (Dibatalkan) Tagihan are cancelled instead of lingering Menunggu Pembayaran (ticket 53).
  { name: "layanan.batalkan_tagihan_lapse", cron: "17 * * * *", tick: batalkanTagihanLapseTick },
  { name: "layanan.paket_siklus", cron: "11 * * * *", tick: paketSiklusTick },
  // Notifications: the Tier 1 alerts the Antrean queued are sent, push + email (ticket 28).
  { name: "notifications.kirim_peringatan_antrean", cron: "* * * * *", tick: kirimPeringatanAntreanTick },
  // Notifications: the Peringatan Staf a domain event queued directly are sent and retried, push + email (ticket 96).
  { name: "notifications.kirim_peringatan_staf", cron: "* * * * *", tick: kirimPeringatanStafTick },
  // Work Queues: a Tier 1 row alerts the Bertugas Admin Platform (all if none), everyone at 30 min untaken, and again at 90 min for a TPU confirmation; a night TPU row waits for 06:00 (ticket 28).
  { name: "queues.peringatan_tier1", cron: "* * * * *", tick: peringatanTier1Tick },
  // Work Queues: a Bertugas ends at 18:00 WIB or 12 h after it began, claims and notes untouched (ticket 28).
  { name: "queues.bertugas_otomatis_mati", cron: "* * * * *", tick: bertugasOtomatisMatiTick },
];

async function pruneIpRequestsTick(ctx: { db: Database }, now: Date): Promise<void> {
  await pruneIpRequests(ctx, now);
}

async function pruneCariMakamAttemptsTick(ctx: { db: Database }, now: Date): Promise<void> {
  await pruneCariMakamAttempts(ctx, now);
}

async function kirimPesanTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.notifications.kirimPesanJatuhTempo(now);
}

/** The worker wrapper around Notifications' Chasing escalation tick (idempotent there, as every tick is). */
async function chasingEskalasiTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.notifications.chasingEskalasiTick(now);
}

/** The worker wrapper around the Pemesanan module's re-alert tick (idempotent there, as every tick is). */
async function realertSaatDukaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await realertKonfirmasiSaatDukaTick(ctx.pemesanan, now);
}

/** The worker wrapper around the Pemesanan module's Terencana payment-hold lapse (idempotent there, as every tick is). */
async function lewatBatasBayarTerencanaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.terencana.lewatBatasBayarTick(now);
}

/** The worker wrapper around the Payouts trigger (idempotent there, as every tick is). */
async function pencairanDueTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tick(now);
}

/** The worker wrapper around the Potongan ageing tick (idempotent there, as every tick is). */
async function potonganUsiaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tickPotongan(now);
}

/** The worker wrapper around the Pemesanan module's "Catat Pemakaman" prompt (idempotent there too). */
async function catatPemakamanPromptTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await catatPemakamanTick(ctx.pemesanan, now);
}

/** The worker wrapper around the Refunds materialising tick (idempotent there, as every tick is). */
async function refundsMaterialiseTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.refunds.tick(now);
}

/** The worker wrapper around the Layanan module's accept-deadline tick (idempotent there, as every tick is). */
async function tidakDiresponsTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.layanan.tandaiTidakDirespons(now);
}

/** The worker wrapper around the Layanan module's monthly scorecard review tick (idempotent there, as every tick is). */
async function tinjauSkorTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.layanan.tinjauSkorTick(now);
}

/**
 * The worker wrapper around the Layanan module's Keluhan window-close tick: the thread's closing
 * signal and the job's Pencairan becoming due (idempotent there, as every tick is).
 */
async function tutupJendelaKeluhanTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.layanan.tutupJendelaKeluhan(now);
}

/** The worker wrapper around the Layanan module's Terlambat tick (idempotent there, as every tick is). */
async function terlambatTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await tandaiTerlambat(ctx.db, now);
}

/** The worker wrapper around the Layanan module's lapsed-Tagihan tick (idempotent there, as every tick is). */
async function batalkanTagihanLapseTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.layanan.batalkanPekerjaanTagihanLapse(now);
}

/** The worker wrapper around the Layanan module's Paket cycle tick (idempotent there, as every tick is). */
async function paketSiklusTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.layanan.paketSiklusTick(now);
}

/**
 * The worker wrapper around the Layanan module's release tick: a job held by the Hak
 * Pakai gate is scheduled once its Hak Pakai has been completed (idempotent there, as
 * every tick is).
 */
async function jadwalkanTertundaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await jadwalkanTertunda({ db: ctx.db, inventory: ctx.inventory }, now);
}

/** The worker wrapper around the Antrean's Tier 1 alert tick (idempotent there, as every tick is). */
async function peringatanTier1Tick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.queues.peringatanTick(now);
}

/** The worker wrapper around the Bertugas auto-off tick (idempotent there, as every tick is). */
async function bertugasOtomatisMatiTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.queues.bertugasTick(now);
}

/** The worker wrapper around Notifications' send tick for queued Tier 1 alerts (idempotent there, as every tick is). */
async function kirimPeringatanAntreanTick(ctx: SchedulerContext): Promise<void> {
  await ctx.notifications.kirimPeringatanAntreanTick({
    barisMasihTerbukaBelumDiambil: ctx.queues.barisMasihTerbukaBelumDiambil,
    barisMasihTerbuka: ctx.queues.barisMasihTerbuka,
  });
}

/** The worker wrapper around Notifications' send tick for the direct staff alerts (idempotent there, as every tick is). */
async function kirimPeringatanStafTick(ctx: SchedulerContext): Promise<void> {
  await ctx.notifications.kirimPeringatanStafTick(ctx.peringatanStafSubjek ? { subjekMasihPerlu: ctx.peringatanStafSubjek } : {});
}
