/**
 * Peringatan Staf for a Tier 1 row of the Antrean (spec, Notifications; ticket
 * 28): a new row, the same row still untaken 30 min after, and a Konfirmasi TPU
 * Saat Duka still unconfirmed 90 min after. The Work Queues module decides who
 * and when (Bertugas, the 06:00 night rule, the escalation clocks); the words and
 * the channels (web push + email, logged, ADR 0004) are this module's.
 *
 * An alert is queued (`antrekanPeringatanAntrean`) inside the transaction in which
 * the Work Queues module claims its stage, and sent by the worker's tick
 * (`kirimPeringatanAntreanTick`): the claim and the queued alert commit or roll back
 * together, and a crash after the commit loses nothing because the queued row is
 * still there to send.
 *
 * The guarantee is at-least-once per channel, not exactly once: an alert's send, its
 * bell entry, its log rows and its new state (attempts, channels done) share one
 * transaction, so they commit or roll back together, but an email or push cannot be
 * rolled back. A crash between a send and that commit sends the alert again on the
 * next tick (a Peringatan Staf twice beats none). Alerts are handled one transaction
 * each, so one that throws is recorded as its own failed attempt and never undoes
 * another's recorded send.
 *
 * A send whose email or push failed is tried again (ticket 91), by the family
 * messages' own policy (`MAKS_PERCOBAAN`, `tundaUlangBerikutnya`: 4 sends, 15 min,
 * 1 h and 4 h apart). Each attempt is logged per channel; a channel that went
 * through is never sent again; after the last attempt the alert gives up and is
 * not escalated (spec: failed staff alerts stop at web push, email and the Antrean).
 */
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { MAKS_PERCOBAAN, tundaUlangBerikutnya } from "./acara";
import type { StaffAlert, StaffAlertKind, StaffAlertLewati, StaffAlertResult } from "./index";
import { notificationsMessage, notificationsPeringatanAntrean } from "./schema";

export const tahapPeringatanAntrean = ["baru", "eskalasi_30", "eskalasi_90", "penugasan_tpu"] as const;
export type TahapPeringatanAntrean = (typeof tahapPeringatanAntrean)[number];

export interface PeringatanAntreanInput {
  /** Every Akun Staf to alert: the Bertugas Admin Platform, or all of them. */
  to: { accountId: string }[];
  tahap: TahapPeringatanAntrean;
  /** The Antrean row: its type's label, what it is about (email only) and the staff page that opens it. */
  row: { label: string; subjectLabel: string; href: string; key?: string };
}

/** A TPU job handed to a Mitra Jasa (ticket 56): the alert names the job and its deadline, never the family. */
export interface PeringatanPenugasanTpuInput {
  to: { accountId: string };
  /** The Layanan and its variant, e.g. "Bersih makam (Standar)". */
  label: string;
  /** Where and when, and the accept deadline: email only. */
  subjectLabel: string;
  /** The staff page where the Mitra Jasa answers. */
  href: string;
}

export interface PeringatanAntreanResult {
  /** Peringatan Staf queued (one per recipient). */
  diantrekan: number;
}

const isi: Record<TahapPeringatanAntrean, { kind: StaffAlertKind; awalan: string; badan: string; email: string; penutup: string }> = {
  baru: {
    kind: "staf_antrean_mendesak",
    awalan: "Antrean mendesak",
    badan: "Baris Tier 1 menunggu diambil.",
    email: "Ada baris Tier 1 di Antrean yang menunggu untuk diambil (Ambil).",
    penutup: "Buka Antrean di aplikasi staf untuk mengambil atau menanganinya.",
  },
  eskalasi_30: {
    kind: "staf_antrean_eskalasi",
    awalan: "Belum diambil, 30 menit",
    badan: "Baris Tier 1 belum diambil siapa pun. Semua Admin Platform diberi tahu.",
    email: "Baris Tier 1 ini belum diambil (Ambil) sampai 30 menit setelah peringatan pertama, jadi semua Admin Platform diberi tahu.",
    penutup: "Buka Antrean di aplikasi staf untuk mengambil atau menanganinya.",
  },
  eskalasi_90: {
    kind: "staf_antrean_eskalasi",
    awalan: "Belum dikonfirmasi, 90 menit",
    badan: "Konfirmasi TPU Saat Duka belum selesai. Semua Admin Platform diberi tahu lagi.",
    email: "Konfirmasi TPU Saat Duka ini masih belum dikonfirmasi 90 menit setelah peringatan pertama, jadi semua Admin Platform diberi tahu lagi.",
    penutup: "Buka Antrean di aplikasi staf untuk mengambil atau menanganinya.",
  },
  // A TPU job handed to a Mitra Jasa (ticket 56): the words never name the family.
  penugasan_tpu: {
    kind: "staf_pekerjaan_tpu_ditugaskan",
    awalan: "Pekerjaan baru ditugaskan",
    badan: "Terima atau tolak di aplikasi sebelum tenggat.",
    email: "Sebuah pekerjaan ditugaskan ke Anda. Tanpa jawaban sampai tenggat, pekerjaan dianggap ditolak.",
    penutup: "Terima atau tolak di aplikasi staf, pada daftar pekerjaan Anda.",
  },
};

/** Queues one Peringatan Staf per recipient in `db` (the caller's open transaction). */
export async function antrekanPeringatanAntrean(db: Database, clock: Clock, input: PeringatanAntreanInput): Promise<PeringatanAntreanResult> {
  if (input.to.length === 0) return { diantrekan: 0 };
  await db.insert(notificationsPeringatanAntrean).values(
    input.to.map((to) => ({
      accountId: to.accountId,
      tahap: input.tahap,
      label: input.row.label,
      subjectLabel: input.row.subjectLabel,
      href: input.row.href,
      rowKey: input.row.key ?? null,
      createdAt: clock.now(),
    })),
  );
  return { diantrekan: input.to.length };
}

/** One send of a Peringatan Staf: how it went, and how many Perangkat Push were tried. */
export interface HasilKirimPeringatan {
  result: StaffAlertResult;
  pushDicoba: number;
}

/** What the tick needs from outside besides Notifications' own send: from Queues, whether an Antrean row is still open. */
export interface KirimPeringatanAntreanOpsi {
  /** True while the Antrean row is still open and untaken (supplied by Queues; Notifications never reads its tables). */
  barisMasihTerbukaBelumDiambil?: (rowKey: string) => Promise<boolean>;
}

/**
 * The worker's send tick: every queued Peringatan Staf about the Antrean not yet
 * done and due goes out through `kirim` (Notifications' own staff-alert send, which
 * writes its bell entry and log rows through the transaction it is handed). Each
 * alert is handled in a transaction of its own, taken `FOR UPDATE SKIP LOCKED`, so
 * two workers never send the same alert and an alert that throws (its own failed
 * attempt, recorded) neither rolls back nor blocks the others. Idempotent: a done
 * or given-up alert is never picked again, and a failed one waits for its backoff,
 * so a second tick in the same minute sends nothing.
 *
 * A retry of an escalation to Admin Platform (`eskalasi_30`) whose row was taken or
 * closed since is dropped instead: marked done, nothing sent, one `dibatalkan` log row.
 */
export async function kirimPeringatanAntreanTick(
  db: Database,
  clock: Clock,
  kirim: (alert: StaffAlert, lewati: StaffAlertLewati, tx: Database) => Promise<HasilKirimPeringatan>,
  opsi: KirimPeringatanAntreanOpsi = {},
): Promise<{ dikirim: number }> {
  const now = clock.now();
  const due = await db
    .select({ id: notificationsPeringatanAntrean.id })
    .from(notificationsPeringatanAntrean)
    .where(
      and(
        isNull(notificationsPeringatanAntrean.sentAt),
        isNull(notificationsPeringatanAntrean.gaveUpAt),
        or(isNull(notificationsPeringatanAntrean.nextAttemptAt), lte(notificationsPeringatanAntrean.nextAttemptAt, now)),
      ),
    )
    .orderBy(asc(notificationsPeringatanAntrean.createdAt), asc(notificationsPeringatanAntrean.id));
  let dikirim = 0;
  for (const { id } of due) {
    try {
      dikirim += await db.transaction((tx) => proses(tx, id, now, kirim, opsi));
    } catch {
      // The send itself threw (a words check, a staff page, a port): that is this alert's failed attempt, kept apart from the others.
      await db.transaction(async (tx) => {
        const [item] = await lockDue(tx, id, now);
        if (item) await catatKegagalan(tx, item, now);
      });
    }
  }
  return { dikirim };
}

type Antrean = typeof notificationsPeringatanAntrean.$inferSelect;

async function lockDue(tx: Database, id: string, now: Date): Promise<Antrean[]> {
  return tx
    .select()
    .from(notificationsPeringatanAntrean)
    .where(
      and(
        eq(notificationsPeringatanAntrean.id, id),
        isNull(notificationsPeringatanAntrean.sentAt),
        isNull(notificationsPeringatanAntrean.gaveUpAt),
        or(isNull(notificationsPeringatanAntrean.nextAttemptAt), lte(notificationsPeringatanAntrean.nextAttemptAt, now)),
      ),
    )
    .for("update", { skipLocked: true });
}

/** A failed attempt: counted, and either scheduled again or given up (the same policy as a failed send). */
async function catatKegagalan(tx: Database, item: Antrean, now: Date): Promise<void> {
  const attempts = (item.attempts ?? 0) + 1;
  const menyerah = attempts >= MAKS_PERCOBAAN;
  await tx
    .update(notificationsPeringatanAntrean)
    .set({ attempts, gaveUpAt: menyerah ? now : null, nextAttemptAt: menyerah ? null : tundaUlangBerikutnya(attempts, now) })
    .where(eq(notificationsPeringatanAntrean.id, item.id));
}

async function proses(
  tx: Database,
  id: string,
  now: Date,
  kirim: (alert: StaffAlert, lewati: StaffAlertLewati, tx: Database) => Promise<HasilKirimPeringatan>,
  opsi: KirimPeringatanAntreanOpsi,
): Promise<number> {
  const [item] = await lockDue(tx, id, now);
  if (!item) return 0; // another worker has it, or it is done
  const tahap = item.tahap as TahapPeringatanAntrean;
  const text = isi[tahap];
  const attempts = (item.attempts ?? 0) + 1;
  const subject = `${text.awalan}: ${item.label}`;

  // A retry of an escalation whose row was taken or closed meanwhile would say something no longer true.
  if (tahap === "eskalasi_30" && attempts > 1 && item.rowKey && opsi.barisMasihTerbukaBelumDiambil) {
    if (!(await opsi.barisMasihTerbukaBelumDiambil(item.rowKey))) {
      await tx.insert(notificationsMessage).values({
        template: text.kind,
        channel: "email",
        akunStafId: item.accountId,
        subject,
        body: "Dibatalkan: baris Antrean sudah diambil atau ditutup sebelum percobaan ulang.",
        status: "dibatalkan",
        attempts,
        sendAfter: now,
        createdAt: now,
      });
      await tx
        .update(notificationsPeringatanAntrean)
        .set({ attempts, sentAt: now, emailDoneAt: item.emailDoneAt ?? now, pushDoneAt: item.pushDoneAt ?? now, nextAttemptAt: null })
        .where(eq(notificationsPeringatanAntrean.id, item.id));
      return 0;
    }
  }

  const { result, pushDicoba } = await kirim(
    {
      to: { accountId: item.accountId },
      kind: text.kind,
      email: { subject, text: [text.email, `${item.label}: ${item.subjectLabel}.`, text.penutup].join("\n") },
      // A push shows on the lock screen: the row's kind only, never who it is about.
      push: { title: subject, body: text.badan, url: item.href },
    },
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
    .update(notificationsPeringatanAntrean)
    .set({
      attempts,
      bellAt: item.bellAt ?? now,
      emailDoneAt: emailSelesai,
      pushDoneAt: pushSelesai,
      sentAt: selesai ? now : null,
      gaveUpAt: menyerah ? now : null,
      nextAttemptAt: selesai || menyerah ? null : tundaUlangBerikutnya(attempts, now),
    })
    .where(eq(notificationsPeringatanAntrean.id, item.id));
  return result.ok ? 1 : 0;
}
