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
import { lapsePayFirstTagihanTick, retryFailedPaymentEffectsTick, type PaymentEffect } from "@/domain/billing";
import { pruneIpRequests } from "@/domain/identity";
import { pruneCariMakamAttempts } from "@/domain/inventory";
import type { Notifications } from "@/domain/notifications";
import { realertKonfirmasiSaatDukaTick } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { Queues } from "@/domain/queues";
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
  /** Family messages due, sent through the worker (ticket 20). */
  notifications: Pick<Notifications, "kirimPesanJatuhTempo">;
  /** The Pemesanan module's own reads and announcements: the Saat Duka re-alert (ticket 23). */
  pemesanan: Parameters<typeof realertKonfirmasiSaatDukaTick>[0];
  /**
   * The Payouts module's own ticks: the Saat Duka Pencairan trigger (Lunas **and**
   * Pemakaman recorded, in either order) and the 60-day Potongan ageing (ticket 32).
   */
  payouts: Pick<Payouts, "tick" | "tickPotongan">;
  /**
   * The Work Queues module's own ticks: the Tier 1 Peringatan Staf and their 30 / 90 minute escalations,
   * and the Bertugas auto-off (ticket 28). The worker composes the whole Antrean to run them, because the
   * rows are its projection.
   */
  queues: Pick<Queues, "tickPeringatan" | "tickBertugas">;
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
  // Billing: a downstream effect of a payment that failed is run again (ticket 19).
  { name: "billing.retry_payment_effects", cron: "*/10 * * * *", tick: retryFailedPaymentEffectsTick },
  // Notifications: queued family messages whose time has come are sent (ticket 20).
  { name: "notifications.kirim_pesan", cron: "* * * * *", tick: kirimPesanTick },
  // Pemesanan: a Saat Duka order still unconfirmed an hour of service time later is alerted again (ticket 23).
  { name: "pemesanan.realert_saat_duka", cron: "* * * * *", tick: realertSaatDukaTick },
  // Payouts: an order whose Tagihan is Lunas and whose Pemakaman is recorded gets its Pencairan items (ticket 32).
  { name: "payouts.pencairan_due", cron: "* * * * *", tick: pencairanDueTick },
  // Payouts: a Potongan 60 days old becomes an offline request (ticket 32).
  { name: "payouts.potongan_usia", cron: "23 2 * * *", tick: potonganUsiaTick },
  // Work Queues: a new Tier 1 row is announced, and an untaken one re-alerts everyone at 30 / 90 min (ticket 28).
  { name: "queues.peringatan_antrean", cron: "* * * * *", tick: peringatanAntreanTick },
  // Work Queues: a Bertugas duty ends by itself at 18:00 WIB or after 12 h (ticket 28).
  { name: "queues.bertugas_auto_off", cron: "*/5 * * * *", tick: bertugasAutoOffTick },
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

/** The worker wrapper around the Pemesanan module's re-alert tick (idempotent there, as every tick is). */
async function realertSaatDukaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await realertKonfirmasiSaatDukaTick(ctx.pemesanan, now);
}

/** The worker wrapper around the Payouts trigger (idempotent there, as every tick is). */
async function pencairanDueTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tick(now);
}

/** The worker wrapper around the Tier 1 alerts and their escalations (idempotent there, as every tick is). */
async function peringatanAntreanTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.queues.tickPeringatan(now);
}

/** The worker wrapper around the Bertugas auto-off (idempotent there, as every tick is). */
async function bertugasAutoOffTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.queues.tickBertugas(now);
}

/** The worker wrapper around the Potongan ageing tick (idempotent there, as every tick is). */
async function potonganUsiaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tickPotongan(now);
}
