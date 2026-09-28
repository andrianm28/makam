/**
 * Chasing overdue pay-after Tagihan (spec, Billing > Chasing; Notifications'
 * reminder table; ticket 29's AC 1, 2, 5). Two moments, both driven from
 * Billing's own `lewat_jatuh_tempo_at` anchor (ticket 25), never recomputed
 * here:
 *
 * - `jadwalkanChasing` queues the four family reminders (H+3/7/14/30) the
 *   moment the anchor becomes known — called once, from the module that
 *   recorded the burial, the same way `tagihanTerbit` queues a pay-first
 *   Tagihan's own reminders at issue. Idempotent by the same
 *   Tagihan-per-template index `queueFamilyEmail` already relies on.
 * - `chasingEskalasiTick` is the worker's periodic tick: at H+1 of a Tagihan
 *   still Lewat Jatuh Tempo, it opens the "Telepon Pemesan" row the overdue
 *   list is a projection of and pushes that Lokasi's Admin Lokasi once. Both
 *   fire exactly once per Tagihan — `teleponPemesanAdaUntukSebab` is the
 *   guard, since the row itself reopens for every later call the list still
 *   expects (around H+14) and must not re-trigger the push each time.
 */
import type { Database } from "@/db/client";
import type { Billing, PayAfterAnchored } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import { formatRupiah } from "@/lib/rupiah";
import { STAFF_AREA_PATH } from "@/lib/staff-area-path";
import type { Clock } from "@/ports/clock";
import type { PushNotification } from "@/ports/web-push";
import { CHASING_ESKALASI_HARI, jadwalPengingatPayAfter } from "./acara";
import { notificationsTagihanKontak } from "./schema";
import { tagihanPengingatLewatJatuhTempoEmail, type TagihanEmailInput } from "./template";
import { bukaTeleponPemesan, teleponPemesanAdaUntukSebab } from "./telepon-pemesan";
import { queueFamilyEmail } from "./pesan-keluarga";
import type { StaffAlert, StaffAlertResult } from "./index";

const HARI_MS = 24 * 60 * 60 * 1000;

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

/** Lock-screen-safe Admin Lokasi push + email for one Chasing escalation (ticket 29). */
function chasingLokasiAlert(
  tagihan: Pick<PayAfterAnchored, "nomorTagihan" | "total">,
  lokasiId: string,
  kind: "h1" | "tidak_tertagih",
): { email: { subject: string; text: string }; push: PushNotification & { url: string } } {
  const url = `${STAFF_AREA_PATH}/admin-lokasi/${lokasiId}/tagihan-lewat-jatuh-tempo`;
  if (kind === "h1") {
    return {
      email: {
        subject: `Tagihan ${tagihan.nomorTagihan} lewat jatuh tempo`,
        text: `Tagihan ${tagihan.nomorTagihan} sebesar ${formatRupiah(tagihan.total)} sudah lewat jatuh tempo sehari. Buka daftar Tagihan lewat jatuh tempo untuk menelepon keluarga.`,
      },
      push: { title: "Tagihan lewat jatuh tempo", body: tagihan.nomorTagihan, url },
    };
  }
  return {
    email: {
      subject: `Tagihan ${tagihan.nomorTagihan} dinyatakan Tidak Tertagih`,
      text: `Admin Platform menyatakan Tagihan ${tagihan.nomorTagihan} Tidak Tertagih. Hak Pakai terkait sudah bisa diakhiri dari daftar Tagihan lewat jatuh tempo.`,
    },
    push: { title: "Tagihan dinyatakan Tidak Tertagih", body: tagihan.nomorTagihan, url },
  };
}

/** Every Akun Staf a Chasing alert must reach: that Lokasi's own Admin Lokasi (spec: "Admin Lokasi push"). */
async function pushLokasi(
  deps: { identity: Pick<Identity, "adminLokasiOf">; send: (alert: StaffAlert) => Promise<StaffAlertResult> },
  tagihan: Pick<PayAfterAnchored, "nomorTagihan" | "total">,
  lokasiId: string,
  kind: "h1" | "tidak_tertagih",
): Promise<void> {
  const alert = chasingLokasiAlert(tagihan, lokasiId, kind);
  const admins = await deps.identity.adminLokasiOf(lokasiId);
  for (const admin of admins) {
    await deps.send({ to: { accountId: admin.accountId }, kind: kind === "h1" ? "staf_tagihan_lewat_jatuh_tempo" : "staf_tagihan_tidak_tertagih", ...alert });
  }
}

/**
 * The worker's Chasing escalation tick: every Tagihan still Lewat Jatuh Tempo
 * at H+1 of its overdue anchor gets its "Telepon Pemesan" call row opened and
 * its Lokasi's Admin Lokasi pushed once, guarded by
 * `teleponPemesanAdaUntukSebab` so a tick run twice (or the row reopening
 * later for the H+14 call) never re-fires either.
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
  const overdue = await deps.billing.tagihanLewatJatuhTempo();
  let dieskalasi = 0;
  for (const t of overdue) {
    if (t.status !== "lewat_jatuh_tempo") continue;
    const h1 = new Date(t.lewatJatuhTempoAt.getTime() + CHASING_ESKALASI_HARI * HARI_MS);
    if (now < h1) continue;
    if (await teleponPemesanAdaUntukSebab(deps.db, "tagihan", t.id, "tagihan_lewat_jatuh_tempo")) continue;
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "tagihan",
      subjectId: t.id,
      nomorTagihan: t.nomorTagihan,
      nomorPemesanan: t.nomorPemesanan,
      lokasiId: t.lokasiId,
      sebab: "tagihan_lewat_jatuh_tempo",
      perihal: `Tagihan ${t.nomorTagihan} lewat jatuh tempo, hubungi keluarga`,
    });
    if (t.lokasiId) await pushLokasi(deps, t, t.lokasiId, "h1");
    dieskalasi += 1;
  }
  return { dieskalasi };
}

/**
 * The Admin Lokasi push "on Tidak Tertagih" (spec, Notifications' reminder
 * table): called once, right after `billing.declareTidakTertagih` succeeds,
 * by whichever layer already holds both (the Server Action, like every other
 * call that crosses Billing and Notifications — ticket 29's Comments).
 */
export async function pushTidakTertagih(
  deps: { identity: Pick<Identity, "adminLokasiOf">; send: (alert: StaffAlert) => Promise<StaffAlertResult> },
  tagihan: Pick<PayAfterAnchored, "nomorTagihan" | "total" | "lokasiId">,
): Promise<void> {
  if (!tagihan.lokasiId) return;
  await pushLokasi(deps, tagihan, tagihan.lokasiId, "tidak_tertagih");
}
