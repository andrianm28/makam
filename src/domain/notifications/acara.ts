/**
 * The Notifications event table (spec, Notifications; ticket 20): one module
 * decides recipient, channel, template and timing for every domain event.
 *
 * Channels (ADR 0004): families get email; staff get a Peringatan Staf by web
 * push to each Perangkat Push and by email. No WhatsApp, no SMS. The Kode
 * Masuk is not here: identity sends it directly (no log, no retry, no row).
 *
 * Timing: everything the family is asked to act on goes out 08:00–20:00 WIB
 * (deferred to 08:00 otherwise) — the Tagihan on issue and its H-1 and
 * due-day reminders (spec, the reminder table) — while a message that asks
 * nothing goes at any hour (the Bukti Pembayaran). A Peringatan Staf goes at
 * any hour too: a new Saat Duka order alerts every Admin Lokasi at night.
 */
import { addWibDays, wib, wibDateOf, wibDayStart } from "@/lib/time/jakarta";

/** Every family email template, in one place. */
export const TEMPLATE_EMAIL = [
  "pesanan_diajukan",
  "pesanan_dikonfirmasi",
  "pesanan_ditolak",
  "pesanan_alternatif_ditawarkan",
  "pesanan_dibatalkan",
  "bukti_pemesanan_terbit",
  "tagihan_terbit",
  "tagihan_pengingat_h_1",
  "tagihan_pengingat_hari_h",
  // Pay-after Chasing (ticket 29): H+3, H+7, H+14, H+30 after the Tagihan's
  // own Lewat Jatuh Tempo anchor (the recorded burial plus its payment
  // window), stopping the moment it is Lunas or Tidak Tertagih.
  "tagihan_pengingat_h3",
  "tagihan_pengingat_h7",
  "tagihan_pengingat_h14",
  "tagihan_pengingat_h30",
  "bukti_pembayaran_terbit",
  "pengurusan_dikonfirmasi",
  "pengembalian_terbit",
] as const;
export type TemplateEmail = (typeof TEMPLATE_EMAIL)[number];

/**
 * The one place a family email is timed: `pengingat` waits for 08:00–20:00
 * WIB, `transaksional` goes at any hour. `TEMPLATE_EMAIL` and this record
 * check each other, and the event table below reads its `waktu` from here, so
 * a template is classified once.
 *
 * A Pemesanan Makam's two messages ask nothing either: the family has already
 * ordered and already paid, so both go at any hour, like the new-order alert
 * the staff of that Lokasi gets.
 */
export const WAKTU_TEMPLATE: Record<TemplateEmail, "transaksional" | "pengingat"> = {
  pesanan_diajukan: "transaksional",
  pesanan_dikonfirmasi: "transaksional",
  // A family that was just turned away, asked to answer about an alternative, or
  // told its order is off, hears it at once: all three ask something of it, and a
  // pending burial does not wait for a morning window (ticket 24).
  pesanan_ditolak: "transaksional",
  pesanan_alternatif_ditawarkan: "transaksional",
  pesanan_dibatalkan: "transaksional",
  bukti_pemesanan_terbit: "transaksional",
  tagihan_terbit: "pengingat",
  tagihan_pengingat_h_1: "pengingat",
  tagihan_pengingat_hari_h: "pengingat",
  tagihan_pengingat_h3: "pengingat",
  tagihan_pengingat_h7: "pengingat",
  tagihan_pengingat_h14: "pengingat",
  tagihan_pengingat_h30: "pengingat",
  bukti_pembayaran_terbit: "transaksional",
  pengurusan_dikonfirmasi: "transaksional",
  // A Bukti Pengembalian Dana asks nothing (the money is already on its way),
  // exactly like a Bukti Pembayaran (ticket 31).
  pengembalian_terbit: "transaksional",
};

/** True for a template of this module's, whose send waits for the window when it is a reminder. */
export function adalahTemplateEmail(template: string): template is TemplateEmail {
  return Object.hasOwn(WAKTU_TEMPLATE, template);
}

/** True for a reminder, whose send waits for 08:00–20:00 WIB. */
export function adalahPengingat(template: string): boolean {
  return adalahTemplateEmail(template) && WAKTU_TEMPLATE[template] === "pengingat";
}

export interface Acara {
  penerima: "email_pemesan" | "akun_staf";
  kanal: "email" | "push_dan_email";
  template: string;
  /** `transaksional`: any hour; `pengingat`: only 08:00–20:00 WIB. */
  waktu: "transaksional" | "pengingat";
}

/** One row per domain event: recipient, channel, template and timing. */
export const TABEL_ACARA: Record<
  | "pesanan_diajukan"
  | "pesanan_dikonfirmasi"
  | "pesanan_ditolak"
  | "pesanan_alternatif_ditawaran"
  | "pesanan_dibatalkan"
  | "bukti_pemesanan_terbit"
  | "tagihan_terbit"
  | "tagihan_pengingat"
  | "bukti_pembayaran_terbit"
  | "pengurusan_dikonfirmasi"
  | "peringatan_staf",
  Acara
> = {
  /**
   * A Pemesanan Makam reaches the family by email only (ADR 0004), at any hour:
   * the order submitted and the same order confirmed (ticket 23). Both are
   * about the Lokasi Mitra's own work, so a send that keeps failing calls that
   * Lokasi's Admin Lokasi rather than Admin Platform.
   */
  pesanan_diajukan: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pesanan_diajukan",
    waktu: WAKTU_TEMPLATE.pesanan_diajukan,
  },
  pesanan_dikonfirmasi: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pesanan_dikonfirmasi",
    waktu: WAKTU_TEMPLATE.pesanan_dikonfirmasi,
  },
  /**
   * The order a Lokasi Mitra cannot serve, the alternative it offers instead and
   * the cancellation that ends it (ticket 24). All three reach the family by
   * email at any hour, and a declined one is also the Tier 1 call Admin Platform
   * owes, so the row is Admin Platform's rather than that Lokasi's.
   */
  pesanan_ditolak: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pesanan_ditolak",
    waktu: WAKTU_TEMPLATE.pesanan_ditolak,
  },
  pesanan_alternatif_ditawaran: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pesanan_alternatif_ditawarkan",
    waktu: WAKTU_TEMPLATE.pesanan_alternatif_ditawarkan,
  },
  pesanan_dibatalkan: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pesanan_dibatalkan",
    waktu: WAKTU_TEMPLATE.pesanan_dibatalkan,
  },
  /**
   * The Bukti Pemesanan of a paid Pemesanan Makam: the link to the document
   * that proves the right, at any hour (ticket 25). Like the other two order
   * messages it is about the Lokasi Mitra's own work, so a send that keeps
   * failing calls that Lokasi's Admin Lokasi rather than Admin Platform.
   */
  bukti_pemesanan_terbit: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "bukti_pemesanan_terbit",
    waktu: WAKTU_TEMPLATE.bukti_pemesanan_terbit,
  },
  tagihan_terbit: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "tagihan_terbit",
    waktu: WAKTU_TEMPLATE.tagihan_terbit,
  },
  tagihan_pengingat: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "tagihan_pengingat_h_1",
    waktu: WAKTU_TEMPLATE.tagihan_pengingat_h_1,
  },
  bukti_pembayaran_terbit: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "bukti_pembayaran_terbit",
    waktu: WAKTU_TEMPLATE.bukti_pembayaran_terbit,
  },
  /**
   * A Saat Duka TPU order reaches its family by email only, at any hour (ticket
   * 45), like the two Lokasi Mitra order messages: the burial is already
   * arranged, so nothing in it asks the family to act. A send that keeps failing
   * opens a "Telepon Pemesan" row with no Lokasi Mitra behind it, so it reaches
   * Admin Platform.
   */
  pengurusan_dikonfirmasi: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "pengurusan_dikonfirmasi",
    waktu: WAKTU_TEMPLATE.pengurusan_dikonfirmasi,
  },
  /**
   * The staff events, one Peringatan Staf per kind (the module's
   * `staffAlertKinds`): by push to every Perangkat Push of the Akun Staf and
   * by email, logged per channel and never retried.
   */
  peringatan_staf: { penerima: "akun_staf", kanal: "push_dan_email", template: "peringatan_staf", waktu: "transaksional" },
};

/** The payment moments a Tagihan is issued for (Billing's PaymentMoment kinds), in one place. */
export const MACAM_MOMEN_TAGIHAN = [
  "saat_duka",
  "pemakaman_hak_pakai_ada",
  "terencana",
  "perpanjangan",
  "pengurusan_berkas",
  "layanan",
  "paket_cycle",
] as const;
export type MacamMomenTagihan = (typeof MACAM_MOMEN_TAGIHAN)[number];

/**
 * Exactly one reminder rule per Tagihan kind, never stacked (spec,
 * Notifications): when its reminders go out, as the spec's reminder table
 * gives them. This ticket schedules the pay-first rule; the rest arrive with
 * the tickets that own them, and each rule stops once its Tagihan is Lunas,
 * Dibatalkan or Tidak Tertagih.
 */
export const ATURAN_PENGINGAT: Record<MacamMomenTagihan, string> = {
  perpanjangan: "saat terbit, H-1 dan hari jatuh tempo",
  pengurusan_berkas: "saat terbit, H-1 dan hari jatuh tempo",
  layanan: "saat terbit, H-1 dan hari jatuh tempo",
  terencana: "sekali, sekitar 4 jam sebelum hold berakhir",
  paket_cycle: "H-7 (saat terbit) dan H-1",
  saat_duka: "H+3, H+7, H+14, H+30",
  pemakaman_hak_pakai_ada: "H+3, H+7, H+14, H+30",
};

/** The pay-first moments, whose reminders this ticket schedules. */
export const MOMEN_PAY_FIRST: ReadonlySet<MacamMomenTagihan> = new Set(["perpanjangan", "pengurusan_berkas", "layanan"]);

/** The pay-after moments Chasing reminds (ticket 29): a burial already happened, so there is no hold to lose by waiting. */
export const MOMEN_PAY_AFTER: ReadonlySet<MacamMomenTagihan> = new Set(["saat_duka", "pemakaman_hak_pakai_ada"]);

/** The start (inclusive) and end (exclusive) of the reminder window, WIB wall-clock hours. */
export const JAM_KIRIM_MULAI = 8;
export const JAM_KIRIM_AKHIR = 20;

const HOUR_MS = 3_600_000;

/** True while a reminder may go out at `instant` (08:00–20:00 WIB). */
export function dalamJamKirim(instant: Date): boolean {
  const minutes = minutesOfWibDay(instant);
  return minutes >= JAM_KIRIM_MULAI * 60 && minutes < JAM_KIRIM_AKHIR * 60;
}

/**
 * Moves `instant` into the reminder window: unchanged inside 08:00–20:00
 * WIB, otherwise the coming 08:00 WIB (today's, or tomorrow's past 20:00).
 */
export function tundaSampaiJamKirim(instant: Date): Date {
  if (dalamJamKirim(instant)) return instant;
  const start = wibDayStart(instant);
  const todayAtEight = new Date(start.getTime() + JAM_KIRIM_MULAI * HOUR_MS);
  return todayAtEight > instant ? todayAtEight : addWibDays(todayAtEight, 1);
}

/** Minutes since 00:00 WIB of the WIB day `instant` falls in. */
function minutesOfWibDay(instant: Date): number {
  return Math.floor((instant.getTime() - wibDayStart(instant).getTime()) / 60_000);
}

/**
 * A reminder that reaches the family a day late says the wrong day, and the
 * rule never stacks: an H-1 reminder arriving on the due day would say
 * "jatuh tempo besok" the day the money is due, and the due-day reminder
 * says it properly. It is dropped, and the due-day one speaks for both.
 */
export function pengingatKetinggalan(template: string, dueAt: Date, now: Date): boolean {
  if (template === "tagihan_pengingat_h_1") return wibDateOf(dueAt) <= wibDateOf(now);
  if (template === "tagihan_pengingat_hari_h") return wibDateOf(dueAt) < wibDateOf(now);
  return false;
}

/**
 * The pay-first reminder times for a Tagihan due at `dueAt`: 08:00 WIB the
 * day before (`h_1`) and 08:00 WIB on the due day itself (`hari_h`), both
 * inside the window by construction, keeping only times after `now`.
 */
export function jadwalPengingatPayFirst(
  dueAt: Date,
  now: Date,
): { macam: "h_1" | "hari_h"; saat: Date }[] {
  const candidates = [
    { macam: "h_1" as const, saat: wib(`${wibDateOf(addWibDays(dueAt, -1))} 08:00`) },
    { macam: "hari_h" as const, saat: wib(`${wibDateOf(dueAt)} 08:00`) },
  ];
  return candidates.filter((candidate) => candidate.saat > now);
}

/**
 * Chasing's own reminder days (spec, Billing > Chasing; Notifications' reminder
 * table): H+3, H+7, H+14, H+30 after a pay-after Tagihan's Lewat Jatuh Tempo
 * anchor (`lewatJatuhTempoAt`, the recorded burial plus its payment window —
 * never the printed due date, which stays the planned burial's).
 */
export const CHASING_HARI = [3, 7, 14, 30] as const;
export type ChasingHari = (typeof CHASING_HARI)[number];

/** The overdue list starts H+1 after the same anchor (spec, Billing > Chasing). */
export const CHASING_ESKALASI_HARI = 1;

/** The second call the overdue list expects, "around H+14" (spec, Billing > Chasing: "at least two calls, around H+1 and around H+14 (08:00–20:00)"). */
export const CHASING_PANGGILAN_KEDUA_HARI = 14;

/**
 * The four Chasing reminder times for a Tagihan whose Lewat Jatuh Tempo anchor
 * is `anchorAt`: 08:00 WIB on each H+N day, keeping only times after `now` (the
 * same shape as `jadwalPengingatPayFirst`, so a burial recorded mid-window still
 * gets every reminder still ahead of it, and none already past).
 */
export function jadwalPengingatPayAfter(anchorAt: Date, now: Date): { macam: ChasingHari; saat: Date }[] {
  return CHASING_HARI.map((hari) => ({ macam: hari, saat: wib(`${wibDateOf(addWibDays(anchorAt, hari))} 08:00`) })).filter(
    (candidate) => candidate.saat > now,
  );
}

/** Sends: the first attempt plus 3 retries with backoff, then a "Telepon Pemesan" row. */
export const MAKS_PERCOBAAN = 4;

/** How long after `attempts`-th failed send the next retry goes out: 15 minutes, an hour, 4 hours. */
export function tundaUlangBerikutnya(failedAttempts: number, now: Date): Date {
  const backoffHours = [0.25, 1, 4];
  const hours = backoffHours[Math.min(failedAttempts, backoffHours.length) - 1] ?? 4;
  return new Date(now.getTime() + hours * HOUR_MS);
}
