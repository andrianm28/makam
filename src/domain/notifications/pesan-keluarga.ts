/**
 * Family messages (ticket 20): a Tagihan issued and its pay-first reminders,
 * sent through the worker's tick. Every send is queued first (the tick sends
 * it), logged with its status, retried 3 times with backoff, and escalated to
 * a Tier 2 "Telepon Pemesan" row when the money message finally fails.
 *
 * Everything the family is asked to act on goes out 08:00–20:00 WIB: the
 * Tagihan on issue and its H-1 and due-day reminders (spec, the reminder
 * table) and the Bukti Pembayaran, which asks nothing (transactional). A
 * message is dropped (`dibatalkan`) once its Tagihan is no longer waiting for
 * money (Lunas, Dibatalkan, Tidak Tertagih, ...) or a reminder reaches the
 * family a day late. An order with no email gets a "Telepon Pemesan" row
 * wherever the family must act; CS shares document links by hand.
 *
 * Each message is queued once per Tagihan per template and claimed before it
 * is sent, so a replayed announcement, a re-run effect and a tick that runs
 * twice all leave the family with one email.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { Billing, Tagihan } from "@/domain/billing";
import { scrubbedError, type ReportError } from "@/lib/observability/report-error";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import {
  adalahPengingat,
  adalahTemplateEmail,
  dalamJamKirim,
  jadwalPengingatPayFirst,
  MACAM_MOMEN_TAGIHAN,
  MAKS_PERCOBAAN,
  MOMEN_PAY_FIRST,
  pengingatKetinggalan,
  tundaSampaiJamKirim,
  tundaUlangBerikutnya,
  type TemplateEmail,
} from "./acara";
import { notificationsMessage, notificationsTagihanKontak, pesanStatuses } from "./schema";
import { pengembalianTerbitEmail, tagihanPengingatEmail, tagihanTerbitEmail, type TagihanEmailInput } from "./template";
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
  /** The order page's full URL from its Nomor Pemesanan, for a Pemesanan Makam's own messages. */
  pesananUrl: (nomor: string) => string;
  /** The Pilih makam list a declined order sends the family back to, with that order's number on the link. */
  pesanUlangUrl: (nomor: string) => string;
  /** A Pengurusan order's own page from its Nomor Pemesanan, where a family follows a TPU filing. */
  pengurusanUrl: (nomor: string) => string;
  /** An order Layanan's own page, from its Nomor Pemesanan. */
  layananUrl: (nomor: string) => string;
}

export const tagihanTerbitSchema = z.object({
  tagihanId: z.uuid(),
  momentKind: z.enum(MACAM_MOMEN_TAGIHAN),
  nomorTagihan: z.string().trim().min(1).max(50),
  nomorPemesanan: z.string().trim().min(1).max(50).nullable(),
  /** The email on the order; null when CS submitted it with no email. */
  email: z.email().max(320).nullable(),
  /** What the Tagihan is for, e.g. "Perpanjangan Makam di Taman Makam Contoh". */
  perihal: z.string().trim().min(1).max(300),
  total: z.number().int().nonnegative(),
  dueAt: z.date(),
  /** The unguessable part of the Tagihan page's link. */
  link: z.string().trim().min(1).max(100),
  /**
   * The issuer's own confirmation email already carries this Tagihan's number
   * and link (Saat Duka at a Lokasi Mitra, Saat Duka TPU), so the family gets
   * one email, not two: the contact is still recorded and the no-email
   * fallback still applies, but the separate "Tagihan terbit" email is not queued.
   */
  bersamaKonfirmasi: z.boolean().optional(),
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

/** A Tagihan still waiting for its money: reminders stop for any other status. */
const TAGIHAN_MENUNGGU_UANG = ["belum_dibayar", "lewat_jatuh_tempo"];

/**
 * Announces a Tagihan: records where its family messages go, queues the
 * Tagihan email and, for a pay-first Tagihan, its H-1 and due-day reminders.
 * The worker's tick sends them. An order with no email gets a "Telepon
 * Pemesan" row at once instead. All of it in one transaction: a Tagihan is
 * never announced without somewhere to send.
 *
 * Announcing the same Tagihan again changes nothing: the family gets one
 * email per reminder kind, however often the announcement is made.
 */
export async function tagihanTerbit(deps: PesanKeluargaDeps, input: TagihanTerbitInput): Promise<TagihanTerbitResult> {
  let parsed = tagihanTerbitSchema.safeParse(input);
  if (!parsed.success) {
    // The issuing confirmation is urgent and must not be blocked by its own
    // announcement. Report which fields were refused (never their values) and
    // degrade to the address-less path: a "Telepon Pemesan" row, so the family
    // is called and CS shares the link by hand. Only if the Tagihan itself is
    // unusable without the address is it refused.
    deps.reportError(new Error("tagihanTerbit: input refused by its schema"), {
      tags: {
        module: "notifications",
        template: "tagihan_terbit",
        fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(","),
      },
    });
    parsed = tagihanTerbitSchema.safeParse({ ...input, email: null });
    if (!parsed.success) return { ok: false, reason: "tagihan_tidak_valid" };
  }
  const data = parsed.data;
  const now = deps.clock.now();

  return refusable<TagihanTerbitResult>(deps.db, async (tx): Promise<TagihanTerbitResult> => {
    await tx
      .insert(notificationsTagihanKontak)
      .values({ tagihanId: data.tagihanId, email: data.email })
      .onConflictDoUpdate({ target: notificationsTagihanKontak.tagihanId, set: { email: data.email } });

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
    if (!data.bersamaKonfirmasi) await queueFamilyEmail(tx, now, {
      template: "tagihan_terbit",
      pemesananId: null,
      tagihanId: data.tagihanId,
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      email: data.email,
      subject: terbit.subject,
      body: terbit.body,
      // "On issue" belongs to the Tagihan's reminder schedule, so it waits for
      // the window like the H-1 and due-day reminders do.
      sendAfter: tundaSampaiJamKirim(now),
    });

    let diingatkan = 0;
    if (MOMEN_PAY_FIRST.has(data.momentKind)) {
      for (const { macam, saat } of jadwalPengingatPayFirst(data.dueAt, now)) {
        const template = macam === "h_1" ? "tagihan_pengingat_h_1" : "tagihan_pengingat_hari_h";
        const pengingat = tagihanPengingatEmail(macam, emailInput);
        const baru = await queueFamilyEmail(tx, now, {
          template,
          pemesananId: null,
          tagihanId: data.tagihanId,
          nomorTagihan: data.nomorTagihan,
          nomorPemesanan: data.nomorPemesanan,
          email: data.email,
          subject: pengingat.subject,
          body: pengingat.body,
          sendAfter: saat,
        });
        if (baru) diingatkan += 1;
      }
    }
    return { ok: true, diingatkan };
  });
}

export const pengembalianTerbitSchema = z.object({
  tagihanId: z.uuid(),
  nomorTagihan: z.string().trim().min(1).max(50),
  nomorPemesanan: z.string().trim().min(1).max(50).nullable(),
  jumlah: z.number().int().nonnegative(),
  biayaLayananPlatformDikembalikan: z.boolean(),
  /** The unguessable part of the Bukti Pengembalian Dana page's link. */
  link: z.string().trim().min(1).max(100),
});
export type PengembalianTerbitInput = z.infer<typeof pengembalianTerbitSchema>;

export type PengembalianTerbitResult = { ok: true } | { ok: false; reason: "tagihan_tidak_valid" };

/**
 * Announces a Bukti Pengembalian Dana: the link, in the family's own email —
 * the Tagihan's own contact, recorded when the Tagihan itself was announced
 * (`tagihanTerbit`). An order with no email opens the call row instead; the
 * message asks nothing, so it goes at any hour (ticket 31).
 */
export async function pengembalianTerbit(deps: PesanKeluargaDeps, input: PengembalianTerbitInput): Promise<PengembalianTerbitResult> {
  const parsed = pengembalianTerbitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tagihan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  return refusable<PengembalianTerbitResult>(deps.db, async (tx) => {
    const [kontak] = await tx
      .select({ email: notificationsTagihanKontak.email })
      .from(notificationsTagihanKontak)
      .where(eq(notificationsTagihanKontak.tagihanId, data.tagihanId));
    const email = kontak?.email ?? null;
    if (!email) {
      await bukaTeleponPemesan(tx, now, {
        subjectKind: "tagihan",
        subjectId: data.tagihanId,
        nomorTagihan: data.nomorTagihan,
        nomorPemesanan: data.nomorPemesanan,
        sebab: "tanpa_email",
      });
      return { ok: true };
    }
    const terbit = pengembalianTerbitEmail({
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      jumlah: data.jumlah,
      biayaLayananPlatformDikembalikan: data.biayaLayananPlatformDikembalikan,
      tautan: deps.dokumenUrl(data.link),
    });
    await queueFamilyEmail(tx, now, {
      template: "pengembalian_terbit",
      pemesananId: null,
      tagihanId: data.tagihanId,
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      email,
      subject: terbit.subject,
      body: terbit.body,
      sendAfter: now,
    });
    return { ok: true };
  });
}

export interface KirimJatuhTempo {
  terkirim: number;
  gagal: number;
  ditunda: number;
  /** Dropped without a send: its Tagihan no longer waits for money, or the reminder reached the family a day late. */
  dibatalkan: number;
}

/** How long a tick holds a message while it sends it: longer than one send, short enough that a worker lost mid-send only costs a delay. */
const KLAIM_MENIT = 10;

/**
 * The worker's send tick (also registered on the scheduler): sends every
 * queued message whose time has come, idempotently — a run twice (or two runs
 * at once) sends once, because a message is claimed before it is sent and the
 * claim is the row's own `sendAfter`. Returns what it did.
 */
export async function kirimPesanJatuhTempo(deps: PesanKeluargaDeps, now: Date): Promise<KirimJatuhTempo> {
  const due = await deps.db
    .select()
    .from(notificationsMessage)
    .where(and(eq(notificationsMessage.status, "menunggu"), eq(notificationsMessage.channel, "email"), lte(notificationsMessage.sendAfter, now)))
    .orderBy(asc(notificationsMessage.sendAfter), asc(notificationsMessage.id))
    .limit(200);
  const hasil: KirimJatuhTempo = { terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 };
  for (const pesan of due) {
    if (!(await klaim(deps.db, pesan, now))) continue;
    if (pesan.tagihanId && berlakuUntukTagihan(pesan.template)) {
      const tagihan = await deps.tagihan.tagihan(pesan.tagihanId);
      if (perluDibatalkan(pesan.template, tagihan, now)) {
        await mark(deps.db, pesan.id, { status: "dibatalkan" });
        hasil.dibatalkan += 1;
        continue;
      }
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
        // Where the call goes is the message's own fact: a message about a
        // Lokasi Mitra's work is called by that Lokasi's own Admin Lokasi, a
        // money message by Admin Platform (spec, Notifications).
        await bukaTeleponPemesan(deps.db, now, {
          subjectKind: pesan.lokasiId ? "pesan_lokasi" : "tagihan",
          subjectId: pesan.lokasiId ? pesan.id : (pesan.tagihanId ?? pesan.id),
          nomorTagihan: pesan.nomorTagihan,
          nomorPemesanan: pesan.nomorPemesanan,
          lokasiId: pesan.lokasiId,
          sebab: "pesan_gagal",
          pesanId: pesan.id,
          perihal: pesan.subject,
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
 * A message about a Tagihan is dropped rather than sent once it no longer has
 * to go out: its Tagihan settled (Lunas, Dibatalkan, Tidak Tertagih, or gone
 * — its reminders stop, spec Notifications), or it is a reminder that reached
 * the family a day late and would name the wrong day. A Bukti Pembayaran and
 * a Bukti Pengembalian Dana are the exceptions: their Tagihan is Lunas or
 * Dikembalikan by definition, and each is the message the family is waiting for.
 */
function perluDibatalkan(template: string, tagihan: Tagihan | null, now: Date): boolean {
  if (!tagihan || !TAGIHAN_MENUNGGU_UANG.includes(tagihan.status)) return true;
  return pengingatKetinggalan(template, tagihan.dueAt, now);
}

/** Whether this module's stop rule applies to the template at all (never to a receipt or a refund's Bukti). */
function berlakuUntukTagihan(template: string): boolean {
  return adalahTemplateEmail(template) && template !== "bukti_pembayaran_terbit" && template !== "pengembalian_terbit";
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

/**
 * Queues one family email and reports whether it was new: one message per
 * Tagihan (or per Pemesanan Makam) per template, whatever queues it twice —
 * the announcement replayed, an effect run again, a tick run twice. `lokasiId`
 * is set by a message about a Lokasi Mitra's own work, which is what routes a
 * send that finally fails to that Lokasi's Admin Lokasi instead of Admin
 * Platform's.
 */
export async function queueFamilyEmail(
  db: Database,
  now: Date,
  message: {
    template: TemplateEmail;
    /** Exactly one of the two subjects: the Tagihan, or the Pemesanan Makam. */
    pemesananId: string | null;
    tagihanId?: string | null;
    nomorTagihan?: string | null;
    nomorPemesanan: string | null;
    /** The Lokasi Mitra whose work this message is about; null for a money message. */
    lokasiId?: string | null;
    email: string;
    subject: string;
    body: string;
    sendAfter: Date;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(notificationsMessage)
    .values({
      ...message,
      tagihanId: message.tagihanId ?? null,
      nomorTagihan: message.nomorTagihan ?? null,
      lokasiId: message.lokasiId ?? null,
      channel: "email",
      status: "menunggu",
      attempts: 0,
      sentAt: null,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsMessage.id });
  return inserted.length > 0;
}

/**
 * Claims one due message for the tick that is sending it: the row's
 * `send_after` moves forward as the claim, in one statement, so a tick that
 * runs twice (or a second worker) leaves the message to the first. The claim
 * is only a lease — a worker that dies mid-send costs the family a delay, not
 * a message.
 */
export async function klaim(db: Database, pesan: { id: string; sendAfter: Date }, now: Date): Promise<boolean> {
  const claimed = await db
    .update(notificationsMessage)
    .set({ sendAfter: new Date(now.getTime() + KLAIM_MENIT * 60_000) })
    .where(
      and(
        eq(notificationsMessage.id, pesan.id),
        eq(notificationsMessage.status, "menunggu"),
        eq(notificationsMessage.sendAfter, pesan.sendAfter),
      ),
    )
    .returning({ id: notificationsMessage.id });
  return claimed.length > 0;
}

export async function mark(
  db: Database,
  id: string,
  patch: Partial<{ status: (typeof pesanStatuses)[number]; attempts: number; sendAfter: Date; sentAt: Date }>,
): Promise<void> {
  await db.update(notificationsMessage).set(patch).where(eq(notificationsMessage.id, id));
}
