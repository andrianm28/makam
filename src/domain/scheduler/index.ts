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
import { realertKonfirmasiSaatDukaTick, type PemesananDeps } from "@/domain/pemesanan";
import { terencanaDibayarTick, terencanaLapsedTick } from "@/domain/pemesanan/tick-terencana";
import type { Payouts } from "@/domain/payouts";
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
  /**
   * The Pemesanan module, for the ticks that are its own work: the Saat Duka re-alert
   * (ticket 23) and the two Pemesanan Terencana money ticks (ticket 37). A module, not a
   * narrow seam, because all three do domain work with what they read — the re-alert
   * announces, the Terencairan ticks grant a Hak Pakai and issue a Bukti Pemesanan — and
   * a pick would be the same module under a narrower name.
   */
  pemesanan: PemesananDeps;
  /**
   * The Payouts module's own ticks: the Saat Duka Pencairan trigger (Lunas **and**
   * Pemakaman recorded, in either order), the Terencairan trigger (end of the Masa
   * Pembatalan, or the first Pemakaman if sooner), and the 60-day Potongan ageing
   * (tickets 32 and 37).
   */
  payouts: Pick<Payouts, "tick" | "tickTerencana" | "tickPotongan">;
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
  // Pemesanan: a paid Pemesanan Terencana becomes Aktif with its Hak Pakai and its Bukti Pemesanan (ticket 37).
  { name: "pemesanan.terencana_dibayar", cron: "* * * * *", tick: terencanaDibayarTickWorker },
  // Pemesanan: a Terencairan whose payment hold ran out is Dibatalkan and its plots released (ticket 37).
  { name: "pemesanan.terencana_lapsed", cron: "* * * * *", tick: terencanaLapsedTickWorker },
  // Payouts: a paid Terencairan's item becomes due at the end of the Masa Pembatalan, or the first Pemakaman if sooner (ticket 37).
  { name: "payouts.pencairan_terencana", cron: "* * * * *", tick: pencairanTerencanaTick },
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

/** The worker wrapper around the Potongan ageing tick (idempotent there, as every tick is). */
async function potonganUsiaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tickPotongan(now);
}

/**
 * The worker wrapper around the paid-half tick (idempotent there, as every tick is):
 * a paid Pemesanan Terencana becomes `aktif` with one Hak Pakai per chosen unit and its
 * Bukti Pemesanan, in one transaction per order.
 */
async function terencanaDibayarTickWorker(ctx: SchedulerContext, now: Date): Promise<void> {
  await terencanaDibayarTick(ctx.pemesanan, now);
}

/**
 * The worker wrapper around the lapse-half tick (idempotent there, as every tick is):
 * a Terencairan whose pay-first Tagihan lapsed at the end of its hold is `dibatalkan`
 * and its plots released, in one transaction per order.
 */
async function terencanaLapsedTickWorker(ctx: SchedulerContext, now: Date): Promise<void> {
  await terencanaLapsedTick(ctx.pemesanan, now);
}

/** The worker wrapper around the Terencairan Pencairan trigger (idempotent there, as every tick is). */
async function pencairanTerencanaTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await ctx.payouts.tickTerencana(now);
}
