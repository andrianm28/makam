import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Pemesanan } from "@/domain/pemesanan";
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

/** Whether an Akun placed an order, asked of Pemesanan's own read; none where nobody signs in (the worker). */
function pemilikPesananDari(pemesanan: Pick<Pemesanan, "orderOf"> | undefined) {
  if (!pemesanan) return undefined;
  return async (nomorPemesanan: string, accountId: string) => (await pemesanan.orderOf(nomorPemesanan, { accountId })) !== null;
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
  pemesanan?: Pick<Pemesanan, "orderOf">;
  payouts: Pick<Payouts, "batalkanPencairanTagihan" | "kurangiPencairanPesanan" | "sudahDicairkanUntukTagihan" | "catatPotongan">;
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
    pemilikPesanan: pemilikPesananDari(deps.pemesanan),
    reportError: deps.reportError,
  });
}
