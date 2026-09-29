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
  notifications?: Pick<Notifications, "kirimPesanJatuhTempo" | "chasingEskalasiTick">;
  pemesanan?: SchedulerContext["pemesanan"];
  payouts?: SchedulerContext["payouts"];
  refunds?: SchedulerContext["refunds"];
  layanan?: SchedulerContext["layanan"];
  terencana?: SchedulerContext["terencana"];
  inventory?: SchedulerContext["inventory"];
}): SchedulerContext {
  return {
    db: parts.db,
    paymentEffects: parts.paymentEffects ?? [],
    reportError: parts.reportError ?? (() => {}),
    notifications: parts.notifications ?? {
      kirimPesanJatuhTempo: async () => ({ terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 }),
      chasingEskalasiTick: async () => ({ dieskalasi: 0 }),
    },
    pemesanan:
      parts.pemesanan ??
      ({
        db: parts.db,
        clock: { now: () => new Date() },
        lokasi: TIMEOUT_LOKASI,
        identity: { adminLokasiOf: async () => [] },
        notifikasi: DIAMDIAM,
      } satisfies SchedulerContext["pemesanan"]),
    // The Payouts ticks change nothing until a test gives them a real module: an
    // empty table is what an ageing tick and a trigger both find anyway.
    payouts: parts.payouts ?? { tick: async () => ({ items: 0, potongan: 0, dilewati: 0 }), tickPotongan: async () => [] },
    // Refunds' own tick changes nothing until a test gives it a real module: an
    // empty Billing list is what the materialising tick finds anyway.
    refunds: parts.refunds ?? { tick: async () => ({ materialised: 0 }) },
    layanan: parts.layanan ?? { tinjauSkorTick: async () => {} },
    // No confirmed Terencana order is waiting until a test gives the tick a real Pemesanan.
    terencana: parts.terencana ?? { lewatBatasBayarTick: async () => ({ dibatalkan: 0 }) },
    // A grave no tick but the Layanan release one reads: a test of another module's
    // tick is undisturbed by it, and a test of the release one passes the real read.
    inventory: parts.inventory ?? { hakPakaiOfUnit: async () => null },
  };
}

/** A Jam Operasional belum diisi, so a test that runs another module's tick re-alerts nothing. */
const TIMEOUT_LOKASI = {
  serviceHoursDeadline: async () => ({ ok: false as const, reason: "jam_operasional_belum_diisi" as const }),
  kontakSiagaOf: async () => null,
};
const DIAMDIAM: PemesananNotifikasi = {
  tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
  pesananDiajukan: async () => {},
  pesananBelumDikonfirmasi: async () => {},
  pesananDikonfirmasi: async () => {},
  pesananDitolak: async () => {},
  pesananAlternatifDitawarkan: async () => {},
  pesananDibatalkan: async () => {},
  pesananBuktiPemesanan: async () => {},
  terencanaDiajukan: async () => {},
  terencanaDikonfirmasi: async () => {},
  terencanaDitolak: async () => {},
  terencanaBatasBayarLewat: async () => {},
  terencanaBukti: async () => {},
  pembatalanTerencana: async () => {},
  chasingDijadwalkan: async () => {},
  tidakTertagihDinyatakan: async () => {},
};
