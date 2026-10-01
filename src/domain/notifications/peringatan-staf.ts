/**
 * The Peringatan Staf a domain event raises directly (ticket 96): a new Saat
 * Duka or Terencana order, a Tugas Lapangan assigned, a Bukti Pencairan issued.
 * The event queues the rendered alert (`antrekanPeringatanStaf`) in its own
 * transaction, so the alert and the fact it announces commit or roll back
 * together, and the worker's tick (`kirimPeringatanStafTick`) sends it, retrying
 * a failed send with the family messages' own policy (`MAKS_PERCOBAAN`,
 * `tundaUlangBerikutnya`: 4 sends, 15 min, 1 h and 4 h apart) each in its own
 * transaction, skipping a channel that already went through.
 *
 * The guarantee is at-least-once per channel, not exactly once: an alert's send,
 * its bell entry, its log rows and its new state share one transaction, but an
 * email or push cannot be rolled back. A crash between a send and that commit
 * sends the alert again on the next tick (a Peringatan Staf twice beats none).
 *
 * A retry whose subject no longer needs it is dropped, where the owning module
 * supplies `subjekMasihPerlu` (an order confirmed, a Lokasi deactivated): marked
 * done, nothing sent, one `dibatalkan` log row. Without a callback, a retry
 * goes out, because Notifications cannot read another module's tables.
 */
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { MAKS_PERCOBAAN, tundaUlangBerikutnya } from "./acara";
import type { StaffAlert, StaffAlertKind, StaffAlertLewati } from "./index";
import type { HasilKirimPeringatan } from "./peringatan-antrean";
import { notificationsMessage, notificationsPeringatanStaf } from "./schema";
import { jalankanTickAntrean } from "./tick-antrean";

export interface PeringatanStafQueueResult {
  /** Peringatan Staf queued (one per recipient; always one here). */
  diantrekan: number;
}

/** Queues one Peringatan Staf in `db` (the caller's open transaction). */
export async function antrekanPeringatanStaf(
  db: Database,
  clock: Clock,
  alert: StaffAlert,
): Promise<PeringatanStafQueueResult> {
  await db.insert(notificationsPeringatanStaf).values({
    accountId: alert.to.accountId,
    kind: alert.kind,
    emailSubject: alert.email.subject,
    emailText: alert.email.text,
    pushTitle: alert.push.title,
    pushBody: alert.push.body,
    pushUrl: alert.push.url,
    subjectKind: alert.subject?.kind ?? null,
    subjectId: alert.subject?.id ?? null,
    createdAt: clock.now(),
  });
  return { diantrekan: 1 };
}

/**
 * What the tick needs from outside: from the raising module, whether a queued
 * alert's subject still needs it. Notifications never reads another module's
 * tables, so a module that can answer supplies this.
 */
export interface KirimPeringatanStafOpsi {
  /** True while the subject still needs the alert (an order still open, a job still assigned). */
  subjekMasihPerlu?: (subject: { kind: string; id: string }) => Promise<boolean>;
}

/**
 * The worker's send tick: every queued direct Peringatan Staf not yet done and
 * due goes out through `kirim` (Notifications' own staff-alert send, which writes
 * its bell entry and log rows through the transaction it is handed). Each alert
 * is handled in a transaction of its own, taken `FOR UPDATE SKIP LOCKED`, so two
 * workers never send the same alert and an alert that throws (its own failed
 * attempt, recorded) neither rolls back nor blocks the others. Idempotent: a done
 * or given-up alert is never picked again, and a failed one waits for its
 * backoff, so a second tick in the same minute sends nothing.
 *
 * A retry whose subject no longer needs it (the callback says so) is dropped:
 * marked done, nothing sent, one `dibatalkan` log row.
 */
export async function kirimPeringatanStafTick(
  db: Database,
  clock: Clock,
  kirim: (alert: StaffAlert, lewati: StaffAlertLewati, tx: Database) => Promise<HasilKirimPeringatan>,
  opsi: KirimPeringatanStafOpsi = {},
): Promise<{ dikirim: number }> {
  return jalankanTickAntrean<Peringatan>({
    db,
    clock,
    due: (now) =>
      db
        .select({ id: notificationsPeringatanStaf.id })
        .from(notificationsPeringatanStaf)
        .where(
          and(
            isNull(notificationsPeringatanStaf.sentAt),
            isNull(notificationsPeringatanStaf.gaveUpAt),
            or(isNull(notificationsPeringatanStaf.nextAttemptAt), lte(notificationsPeringatanStaf.nextAttemptAt, now)),
          ),
        )
        .orderBy(asc(notificationsPeringatanStaf.createdAt), asc(notificationsPeringatanStaf.id)),
    proses: (tx, id, now) => proses(tx, id, now, kirim, opsi),
    lockDue,
    catatKegagalan,
  });
}

type Peringatan = typeof notificationsPeringatanStaf.$inferSelect;

async function lockDue(tx: Database, id: string, now: Date): Promise<Peringatan[]> {
  return tx
    .select()
    .from(notificationsPeringatanStaf)
    .where(
      and(
        eq(notificationsPeringatanStaf.id, id),
        isNull(notificationsPeringatanStaf.sentAt),
        isNull(notificationsPeringatanStaf.gaveUpAt),
        or(isNull(notificationsPeringatanStaf.nextAttemptAt), lte(notificationsPeringatanStaf.nextAttemptAt, now)),
      ),
    )
    .for("update", { skipLocked: true });
}

/** A failed attempt: counted, and either scheduled again or given up (the same policy as a failed send). */
async function catatKegagalan(tx: Database, item: Peringatan, now: Date): Promise<void> {
  const attempts = (item.attempts ?? 0) + 1;
  const menyerah = attempts >= MAKS_PERCOBAAN;
  await tx
    .update(notificationsPeringatanStaf)
    .set({ attempts, gaveUpAt: menyerah ? now : null, nextAttemptAt: menyerah ? null : tundaUlangBerikutnya(attempts, now) })
    .where(eq(notificationsPeringatanStaf.id, item.id));
}

async function proses(
  tx: Database,
  id: string,
  now: Date,
  kirim: (alert: StaffAlert, lewati: StaffAlertLewati, tx: Database) => Promise<HasilKirimPeringatan>,
  opsi: KirimPeringatanStafOpsi,
): Promise<number> {
  const [item] = await lockDue(tx, id, now);
  if (!item) return 0; // another worker has it, or it is done
  const attempts = (item.attempts ?? 0) + 1;

  // A retry whose subject has closed since would say something no longer true.
  if (attempts > 1 && item.subjectKind && item.subjectId && opsi.subjekMasihPerlu) {
    if (!(await opsi.subjekMasihPerlu({ kind: item.subjectKind, id: item.subjectId }))) {
      await tx.insert(notificationsMessage).values({
        template: item.kind,
        channel: "email",
        akunStafId: item.accountId,
        subject: item.emailSubject,
        body: "Dibatalkan: subjek peringatan sudah tidak membutuhkannya sebelum percobaan ulang.",
        status: "dibatalkan",
        attempts,
        sendAfter: now,
        createdAt: now,
      });
      await tx
        .update(notificationsPeringatanStaf)
        .set({ attempts, sentAt: now, emailDoneAt: item.emailDoneAt ?? now, pushDoneAt: item.pushDoneAt ?? now, nextAttemptAt: null })
        .where(eq(notificationsPeringatanStaf.id, item.id));
      return 0;
    }
  }

  const alert: StaffAlert = {
    to: { accountId: item.accountId },
    kind: item.kind as StaffAlertKind,
    email: { subject: item.emailSubject, text: item.emailText },
    push: { title: item.pushTitle, body: item.pushBody, url: item.pushUrl },
    subject: item.subjectKind && item.subjectId ? { kind: item.subjectKind, id: item.subjectId } : undefined,
  };
  const { result, pushDicoba } = await kirim(
    alert,
    { lonceng: item.bellAt !== null, email: item.emailDoneAt !== null, push: item.pushDoneAt !== null },
    tx,
  );
  // An Akun that is no longer staff has nothing to send and nothing to retry.
  const emailSelesai = item.emailDoneAt ?? (!result.ok || result.email !== "gagal" ? now : null);
  // No Perangkat Push to try is nothing to retry either.
  const pushSelesai = item.pushDoneAt ?? (!result.ok || pushDicoba === 0 || result.push.delivered > 0 ? now : null);
  const selesai = emailSelesai !== null && pushSelesai !== null;
  const menyerah = !selesai && attempts >= MAKS_PERCOBAAN;
  await tx
    .update(notificationsPeringatanStaf)
    .set({
      attempts,
      bellAt: item.bellAt ?? now,
      emailDoneAt: emailSelesai,
      pushDoneAt: pushSelesai,
      sentAt: selesai ? now : null,
      gaveUpAt: menyerah ? now : null,
      nextAttemptAt: selesai || menyerah ? null : tundaUlangBerikutnya(attempts, now),
    })
    .where(eq(notificationsPeringatanStaf.id, item.id));
  return result.ok ? 1 : 0;
}
