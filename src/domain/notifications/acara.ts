/**
 * The Notifications event table (spec, Notifications; ticket 20): one module
 * decides recipient, channel, template and timing for every domain event.
 *
 * Channels (ADR 0004): families get email; staff get a Peringatan Staf by web
 * push to each Perangkat Push and by email. No WhatsApp, no SMS. The Kode
 * Masuk is not here: identity sends it directly (no log, no retry, no row).
 *
 * Timing: reminders to families go out only 08:00–20:00 WIB (deferred to
 * 08:00 otherwise); transactional messages and new-order alerts go at any
 * hour. `tagihan_terbit` is transactional: for a pay-first Tagihan the clock
 * runs from issue, so the family must see it at once, day or night.
 */
import { addWibDays, wib, wibDateOf, wibDayStart } from "@/lib/time/jakarta";

/** Every family email template, in one place. */
export const TEMPLATE_EMAIL = [
  "tagihan_terbit",
  "tagihan_pengingat_h_1",
  "tagihan_pengingat_hari_h",
  "bukti_pembayaran_terbit",
] as const;
export type TemplateEmail = (typeof TEMPLATE_EMAIL)[number];

/** The reminder templates by name: a message is a reminder or it is not. */
const TEMPLATE_PENGINGAT: readonly string[] = ["tagihan_pengingat_h_1", "tagihan_pengingat_hari_h"];

/** True for a reminder, whose send waits for 08:00–20:00 WIB. */
export function adalahPengingat(template: string): boolean {
  return TEMPLATE_PENGINGAT.includes(template);
}

export interface Acara {
  penerima: "email_pemesan" | "akun_staf";
  kanal: "email" | "push_dan_email";
  template: string;
  /** `transaksional`: any hour; `pengingat`: only 08:00–20:00 WIB. */
  waktu: "transaksional" | "pengingat";
}

/** One row per family event: recipient, channel, template and timing. */
export const TABEL_ACARA: Record<"tagihan_terbit" | "tagihan_pengingat" | "bukti_pembayaran_terbit", Acara> = {
  tagihan_terbit: { penerima: "email_pemesan", kanal: "email", template: "tagihan_terbit", waktu: "transaksional" },
  tagihan_pengingat: { penerima: "email_pemesan", kanal: "email", template: "tagihan_pengingat_h_1", waktu: "pengingat" },
  bukti_pembayaran_terbit: {
    penerima: "email_pemesan",
    kanal: "email",
    template: "bukti_pembayaran_terbit",
    waktu: "transaksional",
  },
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
 * Notifications): which moments it covers, when its reminders go out, and
 * which ticket builds it. This ticket builds the pay-first rule; each rule
 * stops once its Tagihan is Lunas, Dibatalkan or Tidak Tertagih.
 */
export const ATURAN_PENGINGAT: Record<MacamMomenTagihan, { jadwal: string; pemilik: string }> = {
  perpanjangan: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
  pengurusan_berkas: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
  layanan: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
  terencana: { jadwal: "sekali, sekitar 4 jam sebelum hold berakhir", pemilik: "ticket-37" },
  paket_cycle: { jadwal: "H-7 (saat terbit) dan H-1", pemilik: "ticket-54" },
  saat_duka: { jadwal: "H+3, H+7, H+14, H+30", pemilik: "ticket-29" },
  pemakaman_hak_pakai_ada: { jadwal: "H+3, H+7, H+14, H+30", pemilik: "ticket-29" },
};

/** The pay-first moments, whose reminders this ticket schedules. */
export const MOMEN_PAY_FIRST: ReadonlySet<MacamMomenTagihan> = new Set(["perpanjangan", "pengurusan_berkas", "layanan"]);

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

/** Sends: the first attempt plus 3 retries with backoff, then a "Telepon Pemesan" row. */
export const MAKS_PERCOBAAN = 4;

/** How long after `attempts`-th failed send the next retry goes out: 15 minutes, an hour, 4 hours. */
export function tundaUlangBerikutnya(failedAttempts: number, now: Date): Date {
  const backoffHours = [0.25, 1, 4];
  const hours = backoffHours[Math.min(failedAttempts, backoffHours.length) - 1] ?? 4;
  return new Date(now.getTime() + hours * HOUR_MS);
}
