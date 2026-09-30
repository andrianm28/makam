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
 * still there to send. A sent row is marked in the same transaction as its send, so
 * a row is sent once unless the process dies between the send and that commit
 * (then once more: a Peringatan Staf twice beats none).
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
import { notificationsPeringatanAntrean } from "./schema";

export const tahapPeringatanAntrean = ["baru", "eskalasi_30", "eskalasi_90", "penugasan_tpu"] as const;
export type TahapPeringatanAntrean = (typeof tahapPeringatanAntrean)[number];

export interface PeringatanAntreanInput {
  /** Every Akun Staf to alert: the Bertugas Admin Platform, or all of them. */
  to: { accountId: string }[];
  tahap: TahapPeringatanAntrean;
  /** The Antrean row: its type's label, what it is about (email only) and the staff page that opens it. */
  row: { label: string; subjectLabel: string; href: string };
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
      createdAt: clock.now(),
    })),
  );
  return { diantrekan: input.to.length };
}

/**
 * The worker's send tick: every queued Peringatan Staf about the Antrean not yet
 * done and due goes out through `kirim` (Notifications' own staff-alert send, which
 * logs each channel it tries). Rows are taken `FOR UPDATE SKIP LOCKED`, so two
 * workers never send the same row. Idempotent: a done or given-up row is never
 * picked again, and a failed one waits for its backoff, so a second tick in the
 * same minute sends nothing.
 */
export async function kirimPeringatanAntreanTick(
  db: Database,
  clock: Clock,
  kirim: (alert: StaffAlert, lewati: StaffAlertLewati) => Promise<{ result: StaffAlertResult; pushDicoba: number }>,
): Promise<{ dikirim: number }> {
  return db.transaction(async (tx) => {
    const now = clock.now();
    const antre = await tx
      .select()
      .from(notificationsPeringatanAntrean)
      .where(
        and(
          isNull(notificationsPeringatanAntrean.sentAt),
          isNull(notificationsPeringatanAntrean.gaveUpAt),
          or(isNull(notificationsPeringatanAntrean.nextAttemptAt), lte(notificationsPeringatanAntrean.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(notificationsPeringatanAntrean.createdAt), asc(notificationsPeringatanAntrean.id))
      .for("update", { skipLocked: true });
    let dikirim = 0;
    for (const item of antre) {
      const tahap = item.tahap as TahapPeringatanAntrean;
      const text = isi[tahap];
      const attempts = (item.attempts ?? 0) + 1;
      const { result, pushDicoba } = await kirim(
        {
          to: { accountId: item.accountId },
          kind: text.kind,
          email: {
            subject: `${text.awalan}: ${item.label}`,
            text: [text.email, `${item.label}: ${item.subjectLabel}.`, text.penutup].join("\n"),
          },
          // A push shows on the lock screen: the row's kind only, never who it is about.
          push: { title: `${text.awalan}: ${item.label}`, body: text.badan, url: item.href },
        },
        { lonceng: attempts > 1, email: item.emailDoneAt !== null, push: item.pushDoneAt !== null },
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
          emailDoneAt: emailSelesai,
          pushDoneAt: pushSelesai,
          sentAt: selesai ? now : null,
          gaveUpAt: menyerah ? now : null,
          nextAttemptAt: selesai || menyerah ? null : tundaUlangBerikutnya(attempts, now),
        })
        .where(and(eq(notificationsPeringatanAntrean.id, item.id), isNull(notificationsPeringatanAntrean.sentAt)));
      if (result.ok) dikirim += 1;
    }
    return { dikirim };
  });
}
