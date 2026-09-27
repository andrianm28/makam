/**
 * Family messages (ticket 20): a Tagihan issued and its pay-first reminders,
 * sent through the worker's tick. Every send is queued first (the tick sends
 * it), logged with its status, retried 3 times with backoff, and escalated
 * to a Tier 2 "Telepon Pemesan" row when the money message finally fails.
 *
 * Reminders go out only 08:00–20:00 WIB; the Tagihan and Bukti messages are
 * transactional (any hour). A reminder is dropped (`dibatalkan`) once its
 * Tagihan is no longer waiting for money (Lunas, Dibatalkan, Tidak
 * Tertagih, ...). An order with no email gets a "Telepon Pemesan" row
 * wherever the family must act; CS shares document links by hand.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { Billing } from "@/domain/billing";
import { scrubbedError, type ReportError } from "@/lib/observability/report-error";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import {
  dalamJamKirim,
  adalahPengingat,
  jadwalPengingatPayFirst,
  MACAM_MOMEN_TAGIHAN,
  MAKS_PERCOBAAN,
  MOMEN_PAY_FIRST,
  tundaSampaiJamKirim,
  tundaUlangBerikutnya,
  type TemplateEmail,
} from "./acara";
import { notificationsMessage, notificationsTagihanKontak, pesanStatuses } from "./schema";
import { tagihanPengingatEmail, tagihanTerbitEmail, type TagihanEmailInput } from "./template";
import { bukaTeleponPemesan } from "./telepon-pemesan";

export interface PesanKeluargaDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  reportError: ReportError;
  /** Tagihan status reads for the reminder stop rule; only billing reads its tables. */
  tagihan: Pick<Billing, "tagihan">;
  /** The Tagihan page's full URL from its link, for the email's link into the app. */
  dokumenUrl: (link: string) => string;
}

export const tagihanTerbitSchema = z.object({
  tagihanId: z.uuid(),
  nomorTagihan: z.string().trim().min(1).max(50),
  kind: z.enum(["pay_first", "pay_after"]),
  momentKind: z.enum(MACAM_MOMEN_TAGIHAN),
  nomorPemesanan: z.string().trim().min(1).max(50).nullable(),
  /** The email on the order; null when CS submitted it with no email. */
  email: z.email().max(320).nullable(),
  /** What the Tagihan is for, e.g. "Perpanjangan Makam di Taman Makam Contoh". */
  perihal: z.string().trim().min(1).max(300),
  total: z.number().int().nonnegative(),
  issuedAt: z.date(),
  dueAt: z.date(),
  /** The unguessable part of the Tagihan page's link. */
  link: z.string().trim().min(1).max(100),
  placeName: z.string().trim().max(300).nullable(),
});
export type TagihanTerbitInput = z.infer<typeof tagihanTerbitSchema>;

export type TagihanTerbitResult = { ok: true; diingatkan: number } | { ok: false; reason: "tagihan_tidak_valid" };

/** A message as the order page shows it. */
export interface PesanTercatat {
  id: string;
  template: string;
  channel: "email" | "push";
  status: (typeof pesanStatuses)[number];
  subject: string;
  attempts: number;
  sentAt: Date | null;
}

const TRANSAKSIONAL_TEMPLATES: readonly string[] = ["tagihan_terbit", "bukti_pembayaran_terbit"];

/** A Tagihan still waiting for its money: reminders stop for any other status. */
const TAGIHAN_MENUNGGU_UANG = ["belum_dibayar", "lewat_jatuh_tempo"];

/**
 * Announces a Tagihan: records where its family messages go, queues the
 * Tagihan email (transactional) and, for a pay-first Tagihan, its H-1 and
 * due-day reminders. The worker's tick sends them. An order with no email
 * gets a "Telepon Pemesan" row at once instead. All of it in one
 * transaction: a Tagihan is never announced without somewhere to send.
 */
export async function tagihanTerbit(deps: PesanKeluargaDeps, input: TagihanTerbitInput): Promise<TagihanTerbitResult> {
  const parsed = tagihanTerbitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tagihan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();

  return refusable<TagihanTerbitResult>(deps.db, async (tx): Promise<TagihanTerbitResult> => {
    await tx
      .insert(notificationsTagihanKontak)
      .values({
        tagihanId: data.tagihanId,
        email: data.email,
        nomorTagihan: data.nomorTagihan,
        nomorPemesanan: data.nomorPemesanan,
        total: data.total,
        tagihanLink: data.link,
      })
      .onConflictDoUpdate({
        target: notificationsTagihanKontak.tagihanId,
        set: {
          email: data.email,
          nomorTagihan: data.nomorTagihan,
          nomorPemesanan: data.nomorPemesanan,
          total: data.total,
          tagihanLink: data.link,
        },
      });

    if (!data.email) {
      // A CS order with no email: the family must be called, and CS shares
      // the document link by hand.
      await bukaTeleponPemesan(tx, now, {
        subjectKind: "tagihan",
        subjectId: data.tagihanId,
        nomorTagihan: data.nomorTagihan,
        sebab: "tanpa_email",
      });
      return { ok: true, diingatkan: 0 };
    }

    const emailInput: TagihanEmailInput = {
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      perihal: data.perihal,
      total: data.total,
      dueAt: data.dueAt,
      tautan: deps.dokumenUrl(data.link),
    };
    const terbit = tagihanTerbitEmail(emailInput);
    await queueEmail(tx, now, {
      template: "tagihan_terbit",
      tagihanId: data.tagihanId,
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      email: data.email,
      subject: terbit.subject,
      body: terbit.body,
      sendAfter: now,
    });

    let diingatkan = 0;
    if (MOMEN_PAY_FIRST.has(data.momentKind)) {
      for (const { macam, saat } of jadwalPengingatPayFirst(data.dueAt, now)) {
        const template = macam === "h_1" ? "tagihan_pengingat_h_1" : "tagihan_pengingat_hari_h";
        const pengingat = tagihanPengingatEmail(macam, emailInput);
        await queueEmail(tx, now, {
          template,
          tagihanId: data.tagihanId,
          nomorTagihan: data.nomorTagihan,
          nomorPemesanan: data.nomorPemesanan,
          email: data.email,
          subject: pengingat.subject,
          body: pengingat.body,
          sendAfter: saat,
        });
        diingatkan += 1;
      }
    }
    return { ok: true, diingatkan };
  });
}

export interface KirimJatuhTempo {
  terkirim: number;
  gagal: number;
  ditunda: number;
  dibatalkan: number;
}

/**
 * The worker's send tick (also registered on the scheduler): sends every
 * queued message whose time has come, idempotently (a run twice sends once:
 * the first run marks the row). Returns what it did.
 */
export async function kirimPesanJatuhTempo(deps: PesanKeluargaDeps, now: Date): Promise<KirimJatuhTempo> {
  const due = await deps.db
    .select()
    .from(notificationsMessage)
    .where(and(eq(notificationsMessage.status, "menunggu"), lte(notificationsMessage.sendAfter, now)))
    .orderBy(asc(notificationsMessage.sendAfter), asc(notificationsMessage.id))
    .limit(200);
  const hasil: KirimJatuhTempo = { terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 };
  for (const pesan of due) {
    if (pesan.tagihanId && (await sudahTentu(deps, pesan))) {
      await mark(deps.db, pesan.id, { status: "dibatalkan" });
      hasil.dibatalkan += 1;
      continue;
    }
    if (adalahPengingat(pesan.template) && !dalamJamKirim(now)) {
      await mark(deps.db, pesan.id, { sendAfter: tundaSampaiJamKirim(now) });
      hasil.ditunda += 1;
      continue;
    }
    if (!pesan.email) {
      await mark(deps.db, pesan.id, { status: "tanpa_email" });
      continue;
    }
    try {
      await deps.email.send({ to: pesan.email, subject: pesan.subject, text: pesan.body });
      await mark(deps.db, pesan.id, { status: "terkirim", sentAt: now, attempts: pesan.attempts + 1 });
      hasil.terkirim += 1;
    } catch (error) {
      const attempts = pesan.attempts + 1;
      deps.reportError(scrubbedError(error), {
        tags: { module: "notifications", channel: pesan.channel, template: pesan.template },
      });
      if (attempts >= MAKS_PERCOBAAN) {
        await mark(deps.db, pesan.id, { status: "gagal", attempts });
        await bukaTeleponPemesan(deps.db, now, {
          subjectKind: "tagihan",
          subjectId: pesan.tagihanId ?? pesan.id,
          nomorTagihan: pesan.nomorTagihan,
          sebab: "pesan_gagal",
          pesanId: pesan.id,
        });
        hasil.gagal += 1;
      } else {
        // A reminder's retry waits for the window as well, so a family is
        // never emailed at night about money.
        const jadwal = tundaUlangBerikutnya(attempts, now);
        await mark(deps.db, pesan.id, {
          attempts,
          sendAfter: adalahPengingat(pesan.template) ? tundaSampaiJamKirim(jadwal) : jadwal,
        });
      }
    }
  }
  return hasil;
}

/**
 * A message about a Tagihan that no longer waits for money is dropped rather
 * than sent: its reminders stop (spec, Notifications), and a Tagihan that is
 * already Lunas by the time the tick runs needs no "please pay". A Bukti
 * Pembayaran is the exception: the Tagihan is Lunas by definition, and its
 * receipt is the message the family is waiting for.
 */
async function sudahTentu(
  deps: Pick<PesanKeluargaDeps, "db" | "tagihan">,
  pesan: { template: string; tagihanId: string | null },
): Promise<boolean> {
  if (!pesan.tagihanId || pesan.template === "bukti_pembayaran_terbit") return false;
  if (!adalahPengingat(pesan.template) && !TRANSAKSIONAL_TEMPLATES.includes(pesan.template)) return false;
  const tagihan = await deps.tagihan.tagihan(pesan.tagihanId);
  return !tagihan || !TAGIHAN_MENUNGGU_UANG.includes(tagihan.status);
}

/** Every logged message about one Tagihan, oldest first: what its order page shows. */
export async function pesanTagihan(deps: Pick<PesanKeluargaDeps, "db">, tagihanId: string): Promise<PesanTercatat[]> {
  const rows = await deps.db
    .select()
    .from(notificationsMessage)
    .where(eq(notificationsMessage.tagihanId, tagihanId))
    .orderBy(asc(notificationsMessage.createdAt), asc(notificationsMessage.id));
  return rows.map((row) => ({
    id: row.id,
    template: row.template,
    channel: row.channel,
    status: row.status,
    subject: row.subject,
    attempts: row.attempts,
    sentAt: row.sentAt,
  }));
}

async function queueEmail(
  db: Database,
  now: Date,
  message: {
    template: TemplateEmail;
    tagihanId: string | null;
    nomorTagihan: string | null;
    nomorPemesanan: string | null;
    email: string;
    subject: string;
    body: string;
    sendAfter: Date;
  },
): Promise<void> {
  await db.insert(notificationsMessage).values({ ...message, channel: "email", status: "menunggu", attempts: 0, sentAt: null, createdAt: now });
}

async function mark(
  db: Database,
  id: string,
  patch: Partial<{ status: (typeof pesanStatuses)[number]; attempts: number; sendAfter: Date; sentAt: Date }>,
): Promise<void> {
  await db.update(notificationsMessage).set(patch).where(eq(notificationsMessage.id, id));
}
