import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Pengurusan } from "@/domain/pengurusan";
import { createRefunds, type Refunds } from "@/domain/refunds";
import type { Payouts } from "@/domain/payouts";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";

/** Where a Bukti Pengembalian Dana's page lives, the same as every other document (ticket 31). */
export function buktiPengembalianDanaUrl(env: Pick<RuntimeEnv, "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return (link: string) => `${publicOrigin}${documentPagePath(link)}`;
}

/**
 * Whether an Akun placed an order, asked of Pemesanan's own reads (a Saat Duka order, or a Terencana one, which is
 * where a Pembatalan's refund waits for its bank account); none where nobody signs in (the worker).
 */
export function pemilikPesananDari(
  pemesanan: Pick<Pemesanan, "orderOf" | "terencanaOf"> | undefined,
  /** Pengurusan (a TPU order) is composed after Refunds, so it is reached through a reference filled once it exists. */
  pengurusan?: { current?: Pick<Pengurusan, "orderOf"> },
) {
  if (!pemesanan) return undefined;
  return async (nomorPemesanan: string, accountId: string) =>
    (await pemesanan.orderOf(nomorPemesanan, { accountId })) !== null ||
    (await pemesanan.terencanaOf(nomorPemesanan, { accountId })) !== null ||
    (pengurusan?.current ? (await pengurusan.current.orderOf(nomorPemesanan, { accountId })) !== null : false);
}

/**
 * What the Pemesanan module asks of Refunds (the refund an approved Pembatalan raises, ticket 38), reached through a
 * reference filled once Refunds exists. Refunds is composed after Billing and Payouts, and asks Pemesanan who placed an
 * order, so Pemesanan cannot hold it directly: it holds this, exactly as Billing holds Payouts' `kurangiPencairanPesanan`
 * (`src/server/runtime.ts`). It is only ever *called* once a request is being decided, long after startup finished.
 */
export function refundsTertunda(): {
  refunds: Pick<Refunds, "ajukanBaris" | "permintaan">;
  sambungkan(refunds: Pick<Refunds, "ajukanBaris" | "permintaan">): void;
} {
  const isi: { current?: Pick<Refunds, "ajukanBaris" | "permintaan"> } = {};
  const siap = () => {
    if (!isi.current) throw new Error("Refunds is not composed yet: it was called before startup finished");
    return isi.current;
  };
  return {
    refunds: {
      ajukanBaris: (tagihanId, input, within) => siap().ajukanBaris(tagihanId, input, within),
      permintaan: (id) => siap().permintaan(id),
    },
    sambungkan: (refunds) => {
      isi.current = refunds;
    },
  };
}

/** Refunds on one database, next to the Billing and Payouts it reads and nets through (ticket 31: composed after both). */
export function composeRefunds(deps: {
  env: Pick<RuntimeEnv, "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  audit: AuditLog;
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  billing: Pick<Billing, "within" | "tagihan" | "tagihanMenungguPengembalian">;
  /** Who placed an order; the worker, which never handles a Pemesan's write, composes without it. */
  pemesanan?: Pick<Pemesanan, "orderOf" | "terencanaOf">;
  /** Filled once Pengurusan exists; a TPU order's Pemesan enters the refund account like any other. */
  pengurusan?: { current?: Pick<Pengurusan, "orderOf"> };
  payouts: Pick<Payouts, "batalkanPencairanTagihan" | "kurangiPencairanSebisanya" | "sudahDicairkanUntukTagihan" | "catatPotongan">;
  notifications: Pick<Notifications, "pengembalianTerbit">;
  operatorSettings: Pick<OperatorSettings, "current">;
  reportError?: ReportError;
}): Refunds {
  return createRefunds({
    db: deps.db,
    clock: deps.adapters.clock,
    audit: deps.audit,
    files: deps.adapters.files,
    lokasi: deps.lokasi,
    billing: deps.billing,
    payouts: deps.payouts,
    notifications: deps.notifications,
    operatorSettings: deps.operatorSettings,
    buktiUrl: buktiPengembalianDanaUrl(deps.env),
    pemilikPesanan: pemilikPesananDari(deps.pemesanan, deps.pengurusan),
    reportError: deps.reportError,
  });
}
