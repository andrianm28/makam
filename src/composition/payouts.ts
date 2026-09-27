import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { OperatorSettings } from "@/domain/operator-settings";
import { createPayouts, type KirimBuktiPencairan, type Payouts } from "@/domain/payouts";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import { formatRupiah } from "@/lib/rupiah";
import type { Adapters } from "@/ports";

/**
 * Where a Bukti Pencairan's page lives: inside the container for the PdfRenderer,
 * on the public site for the recipient the link is sent to. The recipient is a
 * Lokasi Mitra's staff or a Mitra Jasa, never a family, but the link is a bearer
 * token exactly as a Tagihan's is.
 */
export function buktiPencairanUrl(env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return {
    /** For the PdfRenderer, which opens the page inside the container. */
    documentPageUrl: (link: string) => `${env.documentPageOrigin}${documentPagePath(link)}`,
    /** What the recipient is sent, and what the Bukti's own page offers. */
    publicUrl: (link: string) => `${publicOrigin}${documentPagePath(link)}`,
  };
}

/**
 * Sends a Bukti Pencairan's link to its recipient: to the Mitra Jasa whose job it
 * pays, or to the Admin Lokasi of the Lokasi Mitra that did the work — a
 * partnership has no login of its own, and its staff are the people who reconcile
 * against it (spec, story 135).
 *
 * A recipient nobody can reach is not an error: the Bukti is in the Admin
 * Platform's run and in its own Lokasi's view either way, and a message is a
 * courtesy on top of the record, never the record itself.
 */
export function kirimBuktiPencairanKe(deps: {
  identity: Pick<Identity, "adminLokasiOf">;
  notifications: Pick<Notifications, "sendStaffAlert">;
}): KirimBuktiPencairan {
  return async (bukti) => {
    const accounts =
      bukti.recipient.kind === "mitra_jasa"
        ? [{ accountId: bukti.recipient.akunId }]
        : (await deps.identity.adminLokasiOf(bukti.recipient.lokasiId)).map((admin) => ({ accountId: admin.accountId }));
    for (const account of accounts) {
      await deps.notifications.sendStaffAlert({
        to: account,
        kind: "staf_bukti_pencairan",
        email: {
          subject: `Bukti Pencairan ${bukti.nomorBukti}`,
          text: `Bukti Pencairan ${bukti.nomorBukti} untuk transfer ${bukti.ditransferPada}: ${formatRupiah(bukti.amount)}. `
            + `Bukti: ${bukti.url}`,
        },
        // A push shows on a lock screen, so it names the work by its document
        // number and its amount, never by a person.
        push: { title: "Bukti Pencairan", body: `${bukti.nomorBukti} · ${formatRupiah(bukti.amount)}`, url: bukti.url },
      });
    }
  };
}

/** Payouts on one database, next to the Billing it reads the issued Tagihan from. */
export function composePayouts(deps: {
  env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  audit: AuditLog;
  identity: Pick<Identity, "adminLokasiOf">;
  lokasi: Pick<Lokasi, "adminPlatformCalendar" | "lokasiMitra" | "jamOperasionalOf">;
  billing: Billing;
  operatorSettings: Pick<OperatorSettings, "current">;
  notifications: Pick<Notifications, "sendStaffAlert">;
  reportError: ReportError;
}): Payouts {
  const urls = buktiPencairanUrl(deps.env);
  return createPayouts({
    db: deps.db,
    clock: deps.adapters.clock,
    audit: deps.audit,
    files: deps.adapters.files,
    lokasi: deps.lokasi,
    // Whether an id is a Lokasi Mitra's at all, asked of the Lokasi module: a Jam
    // Operasional that is belum diisi is still a Lokasi, and "not found" is the
    // only answer that is not one.
    lokasiAda: async (lokasiId) => (await deps.lokasi.jamOperasionalOf(lokasiId)).ok,
    billing: deps.billing,
    operatorSettings: deps.operatorSettings,
    buktiUrl: urls.publicUrl,
    pdf: deps.adapters.pdf,
    kirimBukti: kirimBuktiPencairanKe({ identity: deps.identity, notifications: deps.notifications }),
    reportError: deps.reportError,
  });
}
