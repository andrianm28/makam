import type { Database } from "@/db/client";
import type { PaymentEffect } from "@/domain/billing";
import type { Notifications } from "@/domain/notifications";
import type { PemesananNotifikasi } from "@/domain/pemesanan";
import type { SchedulerContext } from "@/domain/scheduler";
import type { ReportError } from "@/lib/observability/report-error";

/**
 * The worker's scheduler context for a test that drives one tick by hand: the
 * parts it leaves out are the ones its tick never reads, and by default
 * `notifications.kirim_pesan` sends nothing, so a test of another module's
 * tick is not disturbed by it.
 */
export function schedulerContext(parts: {
  db: Database;
  paymentEffects?: readonly PaymentEffect[];
  reportError?: ReportError;
  notifications?: Pick<Notifications, "kirimPesanJatuhTempo">;
  pemesanan?: SchedulerContext["pemesanan"];
  payouts?: SchedulerContext["payouts"];
}): SchedulerContext {
  return {
    db: parts.db,
    paymentEffects: parts.paymentEffects ?? [],
    reportError: parts.reportError ?? (() => {}),
    notifications: parts.notifications ?? { kirimPesanJatuhTempo: async () => ({ terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 }) },
    // A test that drives a Pemesanan tick passes the real module (`parts.pemesanan`);
    // one that does not gets a module whose every function finds nothing, so a tick of
    // another module is not disturbed by an empty table it never had to fill.
    pemesanan: parts.pemesanan ?? pemesananStub(parts.db),
    // The Payouts ticks change nothing until a test gives them a real module: an
    // empty table is what an ageing tick and a trigger both find anyway.
    payouts:
      parts.payouts ??
      ({
        tick: async () => ({ items: 0, potongan: 0, dilewati: 0 }),
        tickTerencana: async () => ({ items: 0, due: 0, dilewati: 0 }),
        tickPotongan: async () => [],
      } satisfies SchedulerContext["payouts"]),
  };
}

/**
 * The Pemesanan module reduced to "nothing to do": the Saat Duka re-alert finds a
 * Jam Operasional belum diisi (so it re-alerts nothing) and both Terencairan money ticks
 * find no order. A test that drives one of those ticks gives the real module instead,
 * which is how a tick is tested as the thing it actually is.
 */
export function pemesananStub(db: Database): SchedulerContext["pemesanan"] {
  return {
    db,
    clock: { now: () => new Date() },
    lokasi: {
      serviceHoursDeadline: async () => ({ ok: false as const, reason: "jam_operasional_belum_diisi" as const }),
      kontakSiagaOf: async () => null,
    },
    identity: { adminLokasiOf: async () => [] },
    notifikasi: DIAMDIAM,
    tickTerencanaDibayar: async () => ({ diaktifkan: 0, gagal: [] }),
    tickTerencanaLapsed: async () => ({ dibatalkan: 0, plotsDirilis: 0 }),
  } as unknown as SchedulerContext["pemesanan"];
}

/** The Pemesanan module's family messages, dropped: a tick never waits on a send. */
const DIAMDIAM: PemesananNotifikasi = {
  pesananDiajukan: async () => {},
  pesananBelumDikonfirmasi: async () => {},
  pesananDikonfirmasi: async () => {},
  terencanaDiajukan: async () => {},
  terencanaDikonfirmasi: async () => {},
  terencanaDitolak: async () => {},
  terencanaDibatalkan: async () => {},
  tagihanTerbit: async () => {},
};
