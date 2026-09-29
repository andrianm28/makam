/**
 * The family messages a Pemesanan Terencana brings (ticket 37; spec, Notifications):
 * its confirmation with the payment hold and Tagihan (one email, not two: owner
 * decision 2026-09-29), a decline, a payment hold that ran out, and the Bukti
 * Pemesanan. A Terencana order always has an Email Terverifikasi (its Pemesan proved
 * it at Kirim), so none of these opens a call row for a missing address.
 *
 * Queued like every family message (the worker's tick sends them), logged on the
 * order, retried with backoff, and one message per order per template however
 * often the announcement is made. `deps.db` may be the caller's open transaction,
 * so the message commits or rolls back with the change it announces.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import {
  terencanaBatasBayarLewatEmail,
  terencanaBuktiEmail,
  terencanaDikonfirmasiEmail,
  terencanaDitolakEmail,
} from "./template-terencana";

const lokasiSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) });
const unitSchema = z.object({ nomor: z.string().trim().min(1).max(60), jenisMakamName: z.string().trim().min(1).max(200) });
const dasar = {
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  lokasi: lokasiSchema,
  unit: z.array(unitSchema).min(1).max(100),
};

/** What the Pemesanan module announces when the Lokasi Mitra has confirmed a Terencana order. */
export const terencanaDikonfirmasiSchema = z.object({
  ...dasar,
  calonName: z.string().trim().min(1).max(200),
  tahanSampai: z.date(),
  kontakLokasi: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().max(30).nullable() }),
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
});
export type TerencanaDikonfirmasiInput = z.infer<typeof terencanaDikonfirmasiSchema>;

/** What it announces when the Lokasi Mitra has declined one. */
export const terencanaDitolakSchema = z.object({
  ...dasar,
  /** The reason off the closed list, already worded by the Pemesanan module. */
  alasan: z.string().trim().min(1).max(300),
});
export type TerencanaDitolakInput = z.infer<typeof terencanaDitolakSchema>;

/** What it announces when the payment hold ran out unpaid. */
export const terencanaBatasBayarLewatSchema = z.object({
  ...dasar,
  nomorTagihan: z.string().trim().min(1).max(50),
});
export type TerencanaBatasBayarLewatInput = z.infer<typeof terencanaBatasBayarLewatSchema>;

/** What it announces when a paid Terencana order has earned its Bukti Pemesanan. */
export const terencanaBuktiSchema = z.object({
  ...dasar,
  bukti: z.object({ nomor: z.string().trim().min(1).max(50), link: z.string().trim().min(1).max(100) }),
  pemegangHakName: z.string().trim().min(1).max(200),
  masa: z.object({ mulai: z.iso.date().nullable(), selesai: z.iso.date().nullable(), tahun: z.number().int().min(1).max(200).nullable().optional() }),
  masaPembatalanBerakhirPada: z.date(),
});
export type TerencanaBuktiInput = z.infer<typeof terencanaBuktiSchema>;

export type PesanTerencanaResult = { ok: true } | { ok: false; reason: "pemesanan_tidak_valid" };

/** The Lokasi step of the Terencana wizard, resolved against the order page's own origin. */
function tautanLokasiLain(deps: Pick<PesanKeluargaDeps, "pesananUrl">, nomor: string): string {
  return new URL("/pesan-makam/terencana", deps.pesananUrl(nomor)).toString();
}

/** Announces the confirmation: the held plots, the deadline, the Tagihan and its link, in one email. */
export async function terencanaDikonfirmasi(deps: PesanKeluargaDeps, input: TerencanaDikonfirmasiInput): Promise<PesanTerencanaResult> {
  const parsed = terencanaDikonfirmasiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const email = terencanaDikonfirmasiEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    unit: data.unit,
    calonName: data.calonName,
    tahanSampai: data.tahanSampai,
    kontakLokasi: data.kontakLokasi,
    tagihan: { nomorTagihan: data.tagihan.nomorTagihan, total: data.tagihan.total, dueAt: data.tagihan.dueAt, tautan: deps.dokumenUrl(data.tagihan.link) },
    tautan: deps.pesananUrl(data.nomor),
  });
  const now = deps.clock.now();
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_dikonfirmasi",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // The family is asked to pay before a deadline that is already running: it goes at once.
    sendAfter: now,
  });
  return { ok: true };
}

/** Announces a decline: why, that nothing is owed, and the way back to the Lokasi step. */
export async function terencanaDitolak(deps: PesanKeluargaDeps, input: TerencanaDitolakInput): Promise<PesanTerencanaResult> {
  const parsed = terencanaDitolakSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const email = terencanaDitolakEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    unit: data.unit,
    alasan: data.alasan,
    tautan: deps.pesananUrl(data.nomor),
    tautanLokasiLain: tautanLokasiLain(deps, data.nomor),
  });
  const now = deps.clock.now();
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_ditolak",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}

/** Announces a payment hold that ran out: the plots went back and nothing was charged. */
export async function terencanaBatasBayarLewat(deps: PesanKeluargaDeps, input: TerencanaBatasBayarLewatInput): Promise<PesanTerencanaResult> {
  const parsed = terencanaBatasBayarLewatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const email = terencanaBatasBayarLewatEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    unit: data.unit,
    nomorTagihan: data.nomorTagihan,
    tautan: deps.pesananUrl(data.nomor),
    tautanLokasiLain: tautanLokasiLain(deps, data.nomor),
  });
  const now = deps.clock.now();
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_dibatalkan",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: null,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}

/** Announces the Bukti Pemesanan of a paid Terencana order, and when its Masa Pembatalan ends. */
export async function terencanaBukti(deps: PesanKeluargaDeps, input: TerencanaBuktiInput): Promise<PesanTerencanaResult> {
  const parsed = terencanaBuktiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const email = terencanaBuktiEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    bukti: { nomor: data.bukti.nomor, tautan: deps.dokumenUrl(data.bukti.link) },
    petakNomor: data.unit.map((satu) => satu.nomor).join(", "),
    pemegangHakName: data.pemegangHakName,
    masa: data.masa,
    masaPembatalanBerakhirPada: data.masaPembatalanBerakhirPada,
    tautan: deps.pesananUrl(data.nomor),
  });
  const now = deps.clock.now();
  await queueFamilyEmail(deps.db, now, {
    template: "bukti_pemesanan_terbit",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}
