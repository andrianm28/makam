/**
 * How the Antrean's own Peringatan Staf read (spec, Work Queues: Tier 1 rows
 * alert the Bertugas staff, or everyone, and escalate while untaken; ticket 28).
 * The Work Queues module carries the facts — the row, the stage, who is on duty
 * — and the words live here, once, as they do for a Saat Duka order
 * (`./pemesanan-labels.ts`).
 *
 * A Peringatan Staf is `transaksional` (spec, Notifications: it goes out at any
 * hour — a new Saat Duka order alerts every Admin Lokasi at night), so nothing
 * here waits for the 08:00–20:00 WIB reminder window. The 06:00 WIB hold is a
 * property of the **row** (a TPU row created at night), decided by the module
 * before the message exists, and not by the send.
 */

import { formatTanggalJam } from "@/lib/time/jakarta";
import type { PushNotification } from "@/ports/web-push";

/** The one Antrean page: a Peringatan Staf push may open this or nothing else (`STAFF_AREA_PATH`). */
export const ANTREAN_PATH = "/staf/admin-platform/antrean";

/** What one row is told: the row's own words, whether it is new or an escalation, and when it is due. */
export interface BarisPeringatan {
  /** The row type's own label, e.g. "Konfirmasi Lokasi terlambat". */
  label: string;
  /** The row's subject, which may name a family: the email may carry it, the push may not. */
  subjectLabel: string;
  deadline: Date | null;
  /** True once the deadline has passed (the Clock's now). */
  pastDeadline: boolean;
}

/**
 * The Peringatan Staf a Tier 1 Antrean row raises: to whoever is Bertugas when
 * it appears, and to every Admin Platform when nobody is, or as the escalation
 * that goes to everyone.
 *
 * The push shows on a lock screen, so it carries no names, phone numbers or
 * emails (Notifications refuses those): the row is named by what kind of work it
 * is, and the push opens the Antrean, where the row and its subject are. The
 * email carries the subject label and the deadline.
 */
export function stafAntreanAlert(
  baris: BarisPeringatan,
  tahap: { escalated: boolean; menit: number },
): {
  email: { subject: string; text: string };
  push: PushNotification & { url: string };
} {
  const tenggat = baris.deadline
    ? `Tenggat: ${formatTanggalJam(baris.deadline)}${baris.pastDeadline ? " — lewat tenggat." : "."}`
    : "Baris ini tidak punya tenggat.";
  const kepala = tahap.escalated
    ? `Baris Antrean Tier 1 "${baris.label}" sudah ${tahap.menit} menit belum diambil (Ambil).`
    : `Baris Antrean Tier 1 baru: "${baris.label}".`;
  return {
    email: {
      subject: tahap.escalated ? `Antrean Tier 1 belum diambil: ${baris.label}` : `Antrean Tier 1 baru: ${baris.label}`,
      text: [
        kepala,
        baris.subjectLabel,
        tenggat,
        "Baris ini ada di Antrean Admin Platform. Buka di aplikasi staf untuk mengambil (Ambil) atau menulis Catatan Internal.",
      ].join("\n"),
    },
    push: {
      title: tahap.escalated ? "Antrean Tier 1 belum diambil" : "Antrean Tier 1 baru",
      body: tahap.escalated ? `${baris.label} · belum diambil ${tahap.menit} menit` : baris.label,
      url: ANTREAN_PATH,
    },
  };
}
