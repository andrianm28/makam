/**
 * Chasing overdue pay-after Tagihan (spec, Billing > Chasing; Notifications'
 * reminder table; ticket 29's AC 1, 2, 5). Everything is driven from Billing's
 * own `lewat_jatuh_tempo_at` anchor (ticket 25), never recomputed here:
 *
 * - `jadwalkanChasing` queues the four family reminders (H+3/7/14/30) the
 *   moment the anchor becomes known, the way `tagihanTerbit` queues a pay-first
 *   Tagihan's own. Idempotent by the Tagihan-per-template index.
 * - `chasingEskalasiTick` is the worker's periodic tick. Spec: "at least two
 *   calls, around H+1 and around H+14 (08:00–20:00)" and "All go out within
 *   08:00–20:00 WIB". Inside that window it opens the first "Telepon Pemesan"
 *   row at H+1 (with the Admin Lokasi push queued in the **same transaction**)
 *   and the second at H+14, each exactly once (`teleponPemesanHitungUntukSebab`).
 * - The Admin Lokasi push is a queued message (`notifications_message`, channel
 *   push), driven from database state: `kirimPeringatanLokasi` sends what is
 *   due and marks it, so a tick that dies mid-send re-sends on its next run and
 *   a tick run twice sends once. `antrekanPeringatanTidakTertagih` queues the
 *   "on Tidak Tertagih" one inside the caller's own transaction.
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing, PayAfterAnchored } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import { formatRupiah } from "@/lib/rupiah";
import { STAFF_AREA_PATH } from "@/lib/staff-area-path";
import { DAY_MS } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { CHASING_ESKALASI_HARI, CHASING_PANGGILAN_KEDUA_HARI, dalamJamKirim, jadwalPengingatPayAfter, tundaSampaiJamKirim } from "./acara";
import { klaim, mark, queueFamilyEmail } from "./pesan-keluarga";
import { notificationsMessage, notificationsTagihanKontak } from "./schema";
import { tagihanPengingatLewatJatuhTempoEmail, type TagihanEmailInput } from "./template";
import { bukaTeleponPemesan, teleponPemesanHitungUntukSebab } from "./telepon-pemesan";
import type { StaffAlert, StaffAlertResult } from "./index";

export interface JadwalkanChasingInput {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  /** The email on the order; null when CS submitted it with no email (no reminder to queue; the H+1 escalation still opens a call row). */
  email: string | null;
  perihal: string;
  total: number;
  lewatJatuhTempoAt: Date;
  link: string;
}

/**
 * Queues a pay-after Tagihan's four Chasing reminders (H+3/7/14/30 of its
 * overdue anchor) and records where its family messages go, the way
 * `tagihanTerbit` does for a pay-first Tagihan. Called once, by the module
 * that recorded the burial and so learned the anchor
 * (`billing.setOverdueAnchor`); calling it again (a retried effect, a replayed
 * step) queues nothing new.
 */
export async function jadwalkanChasing(
  deps: { db: Database; clock: Clock },
  input: JadwalkanChasingInput,
): Promise<{ dijadwalkan: number }> {
  const now = deps.clock.now();
  await deps.db
    .insert(notificationsTagihanKontak)
    .values({ tagihanId: input.tagihanId, email: input.email })
    .onConflictDoUpdate({ target: notificationsTagihanKontak.tagihanId, set: { email: input.email } });
  if (!input.email) return { dijadwalkan: 0 };

  const emailInput: TagihanEmailInput = {
    nomorTagihan: input.nomorTagihan,
    nomorPemesanan: input.nomorPemesanan,
    perihal: input.perihal,
    total: input.total,
    dueAt: input.lewatJatuhTempoAt,
    tautan: input.link,
  };
  let dijadwalkan = 0;
  for (const { macam, saat } of jadwalPengingatPayAfter(input.lewatJatuhTempoAt, now)) {
    const template = `tagihan_pengingat_h${macam}` as const;
    const pengingat = tagihanPengingatLewatJatuhTempoEmail(macam, emailInput);
    const baru = await queueFamilyEmail(deps.db, now, {
      template,
      pemesananId: null,
      tagihanId: input.tagihanId,
      nomorTagihan: input.nomorTagihan,
      nomorPemesanan: input.nomorPemesanan,
      email: input.email,
      subject: pengingat.subject,
      body: pengingat.body,
      sendAfter: saat,
    });
    if (baru) dijadwalkan += 1;
  }
  return { dijadwalkan };
}

type KindPeringatanLokasi = "staf_tagihan_lewat_jatuh_tempo" | "staf_tagihan_tidak_tertagih";
const KIND_PERINGATAN_LOKASI: readonly KindPeringatanLokasi[] = ["staf_tagihan_lewat_jatuh_tempo", "staf_tagihan_tidak_tertagih"];

const PUSH_TITLE: Record<KindPeringatanLokasi, string> = {
  staf_tagihan_lewat_jatuh_tempo: "Tagihan lewat jatuh tempo",
  staf_tagihan_tidak_tertagih: "Tagihan dinyatakan Tidak Tertagih",
};

/** The email a Chasing push to an Admin Lokasi carries (the push itself is lock-screen safe: title and Nomor Tagihan only). */
function emailPeringatanLokasi(kind: KindPeringatanLokasi, tagihan: Pick<PayAfterAnchored, "nomorTagihan" | "total">) {
  return kind === "staf_tagihan_lewat_jatuh_tempo"
    ? {
        subject: `Tagihan ${tagihan.nomorTagihan} lewat jatuh tempo`,
        text: `Tagihan ${tagihan.nomorTagihan} sebesar ${formatRupiah(tagihan.total)} sudah lewat jatuh tempo sehari. Buka daftar Tagihan lewat jatuh tempo untuk menelepon keluarga.`,
      }
    : {
        subject: `Tagihan ${tagihan.nomorTagihan} dinyatakan Tidak Tertagih`,
        text: `Admin Platform menyatakan Tagihan ${tagihan.nomorTagihan} Tidak Tertagih. Hak Pakai terkait sudah bisa diakhiri dari daftar Tagihan lewat jatuh tempo.`,
      };
}

/**
 * Queues one Admin Lokasi push (with its email) for a Tagihan, inside the
 * caller's own transaction `tx`, so it commits or rolls back with the data
 * that caused it. Held for 08:00–20:00 WIB (spec: every reminder goes out
 * within it) and once per Tagihan per kind (the Tagihan-per-template index).
 * A Tagihan with no Lokasi Mitra (a TPU order) has no Admin Lokasi to push.
 */
export async function antrekanPeringatanLokasi(
  tx: Database,
  now: Date,
  kind: KindPeringatanLokasi,
  tagihan: Pick<PayAfterAnchored, "id" | "nomorTagihan" | "total" | "lokasiId">,
): Promise<boolean> {
  if (!tagihan.lokasiId) return false;
  const email = emailPeringatanLokasi(kind, tagihan);
  const inserted = await tx
    .insert(notificationsMessage)
    .values({
      template: kind,
      channel: "push",
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      lokasiId: tagihan.lokasiId,
      subject: email.subject,
      body: email.text,
      status: "menunggu",
      attempts: 0,
      sendAfter: tundaSampaiJamKirim(now),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsMessage.id });
  return inserted.length > 0;
}

/**
 * Sends every queued Admin Lokasi push that is due: to each Admin Lokasi of its
 * Lokasi, claimed first (a lease, as the family emails use) and marked sent
 * afterwards. A send that throws leaves the row `menunggu`, so the next tick
 * sends it again; one run twice sends once.
 */
export async function kirimPeringatanLokasi(
  deps: {
    db: Database;
    identity: Pick<Identity, "adminLokasiOf">;
    send: (alert: StaffAlert) => Promise<StaffAlertResult>;
  },
  now: Date,
): Promise<number> {
  const due = await deps.db
    .select()
    .from(notificationsMessage)
    .where(
      and(
        eq(notificationsMessage.status, "menunggu"),
        eq(notificationsMessage.channel, "push"),
        inArray(notificationsMessage.template, [...KIND_PERINGATAN_LOKASI]),
        lte(notificationsMessage.sendAfter, now),
      ),
    )
    .orderBy(asc(notificationsMessage.sendAfter), asc(notificationsMessage.id))
    .limit(200);
  let terkirim = 0;
  for (const pesan of due) {
    if (!(await klaim(deps.db, pesan, now))) continue;
    const kind = pesan.template as KindPeringatanLokasi;
    if (!pesan.lokasiId) {
      await mark(deps.db, pesan.id, { status: "dibatalkan" });
      continue;
    }
    const url = `${STAFF_AREA_PATH}/admin-lokasi/${pesan.lokasiId}/tagihan-lewat-jatuh-tempo`;
    for (const admin of await deps.identity.adminLokasiOf(pesan.lokasiId)) {
      await deps.send({
        to: { accountId: admin.accountId },
        kind,
        email: { subject: pesan.subject, text: pesan.body },
        push: { title: PUSH_TITLE[kind], body: pesan.nomorTagihan ?? "", url },
      });
    }
    await mark(deps.db, pesan.id, { status: "terkirim", sentAt: now, attempts: pesan.attempts + 1 });
    terkirim += 1;
  }
  return terkirim;
}

/**
 * The worker's Chasing tick: inside 08:00–20:00 WIB, every Tagihan still Lewat
 * Jatuh Tempo gets its first call row at H+1 (the Admin Lokasi push queued in
 * the same transaction) and its second around H+14; then every queued push that
 * is due is sent. Idempotent, and nothing is lost between steps: the row and
 * the queued push commit together, and the send is driven from the queue.
 */
export async function chasingEskalasiTick(
  deps: {
    db: Database;
    billing: Pick<Billing, "tagihanLewatJatuhTempo">;
    identity: Pick<Identity, "adminLokasiOf">;
    send: (alert: StaffAlert) => Promise<StaffAlertResult>;
  },
  now: Date,
): Promise<{ dieskalasi: number }> {
  let dieskalasi = 0;
  if (dalamJamKirim(now)) {
    for (const t of await deps.billing.tagihanLewatJatuhTempo()) {
      if (t.status !== "lewat_jatuh_tempo") continue;
      const dibuka = await deps.db.transaction(async (tx) => {
        const sudah = await teleponPemesanHitungUntukSebab(tx, "tagihan", t.id, "tagihan_lewat_jatuh_tempo");
        const pertama = sudah === 0 && now.getTime() >= t.lewatJatuhTempoAt.getTime() + CHASING_ESKALASI_HARI * DAY_MS;
        const kedua = sudah === 1 && now.getTime() >= t.lewatJatuhTempoAt.getTime() + CHASING_PANGGILAN_KEDUA_HARI * DAY_MS;
        if (!pertama && !kedua) return false;
        const { baru } = await bukaTeleponPemesan(tx, now, {
          subjectKind: "tagihan",
          subjectId: t.id,
          nomorTagihan: t.nomorTagihan,
          nomorPemesanan: t.nomorPemesanan,
          lokasiId: t.lokasiId,
          sebab: "tagihan_lewat_jatuh_tempo",
          perihal: `Tagihan ${t.nomorTagihan} lewat jatuh tempo, hubungi keluarga`,
        });
        if (pertama && baru) await antrekanPeringatanLokasi(tx, now, "staf_tagihan_lewat_jatuh_tempo", t);
        return baru;
      });
      if (dibuka) dieskalasi += 1;
    }
  }
  await kirimPeringatanLokasi(deps, now);
  return { dieskalasi };
}
