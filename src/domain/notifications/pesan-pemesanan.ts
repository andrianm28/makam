/**
 * The family messages a Pemesanan Makam brings (ticket 23; spec,
 * Notifications): an order submitted, and the same order confirmed. Both are
 * about a Lokasi Mitra's own work, so a send that finally fails opens the call
 * row in the **Antrean Lokasi** (that Lokasi's Admin Lokasi call the family)
 * rather than Admin Platform's Antrean, which keeps money subjects.
 *
 * Queued like every family message (the worker's tick sends them), logged on
 * the order, retried with backoff, and one message per order per template
 * however often the announcement is made.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { buktiPekerjaanValues } from "@/domain/layanan/pesanan-schema";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { queueFamilyEmail, type PesanKeluargaDeps, type PesanTercatat } from "./pesan-keluarga";
import { notificationsMessage } from "./schema";
import { bukaTeleponPemesan } from "./telepon-pemesan";
import {
  layananPekerjaanSelesaiEmail,
  layananPesananTerbitEmail,
  pesananDiajukanEmail,
  pesananDikonfirmasiEmail,
} from "./template";

const lokasiSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) });
const almarhumSchema = z.object({ name: z.string().trim().min(1).max(200), tanggalWafat: z.iso.date() });

/** What the Pemesanan module announces when a family has just placed a Saat Duka order. */
export const pesananDiajukanSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  /** The Email Terverifikasi the order was proven with; null when the order has none. */
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  jenisMakamName: z.string().trim().min(1).max(200).nullable(),
  almarhum: almarhumSchema,
  rencanaPemakamanAt: z.date().nullable(),
  konfirmasiDueAt: z.date().nullable(),
});
export type PesananDiajukanInput = z.infer<typeof pesananDiajukanSchema>;

/** What it announces when the Admin Lokasi has confirmed that order. */
export const pesananDikonfirmasiSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  jenisMakamName: z.string().trim().min(1).max(200).nullable(),
  almarhum: almarhumSchema,
  /** The burial the Lokasi agreed with the family, which the Tagihan counts from. */
  pemakamanAt: z.date(),
  /** The assigned Petak Makam, as its Nomor Makam; null while the Lokasi has none to give. */
  petak: z.object({ nomor: z.string().trim().min(1).max(60) }).nullable(),
  /** The Admin Lokasi of that Lokasi Mitra to call, by name. */
  kontakLokasi: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().max(30).nullable() }),
  /** The Lokasi Mitra's document checklist, as the family should bring it. */
  dokumen: z.array(z.string().trim().min(1).max(200)).max(50),
  /** The pay-after Tagihan issued with the confirmation. */
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
});
export type PesananDikonfirmasiInput = z.infer<typeof pesananDikonfirmasiSchema>;

export type PesanPemesananResult = { ok: true } | { ok: false; reason: "pemesanan_tidak_valid" };

/**
 * Announces a Pemesanan Makam to its family: the address it goes to, the one
 * message, and, when the order has no email, a call row for the Lokasi's own
 * staff. Announcing twice changes nothing: one message per order per template.
 */
export async function pesananDiajukan(deps: PesanKeluargaDeps, input: PesananDiajukanInput): Promise<PesanPemesananResult> {
  const parsed = pesananDiajukanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "pemesanan",
      subjectId: data.pemesananId,
      nomorPemesanan: data.nomor,
      lokasiId: data.lokasi.id,
      sebab: "tanpa_email",
      perihal: `Pesanan ${data.nomor} di ${data.lokasi.name} tidak bisa dikirim lewat email: beritahu keluarga petak dan jadwal pemakamannya.`,
    });
    return { ok: true };
  }
  const email = pesananDiajukanEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    jenisMakamName: data.jenisMakamName,
    almarhumName: data.almarhum.name,
    tanggalWafat: data.almarhum.tanggalWafat,
    rencanaPemakamanAt: data.rencanaPemakamanAt,
    konfirmasiDueAt: data.konfirmasiDueAt,
    tautan: deps.pesananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_diajukan",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // Transactional, so it asks nothing: it goes at any hour, like the new-order alert.
    sendAfter: now,
  });
  return { ok: true };
}

/**
 * Announces the confirmation of a Pemesanan Makam: the assigned Petak, the
 * Lokasi's contact, the document checklist, the pay-after Tagihan, and the
 * promise that the burial goes ahead whatever the payment does.
 */
export async function pesananDikonfirmasi(
  deps: PesanKeluargaDeps,
  input: PesananDikonfirmasiInput,
): Promise<PesanPemesananResult> {
  const parsed = pesananDikonfirmasiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "pemesanan",
      subjectId: data.pemesananId,
      nomorPemesanan: data.nomor,
      lokasiId: data.lokasi.id,
      sebab: "tanpa_email",
      perihal: `Pesanan ${data.nomor} di ${data.lokasi.name} sudah dikonfirmasi: beritahu keluarga petak dan jadwal pemakamannya.`,
    });
    return { ok: true };
  }
  const email = pesananDikonfirmasiEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    jenisMakamName: data.jenisMakamName,
    almarhumName: data.almarhum.name,
    pemakamanAt: data.pemakamanAt,
    petakNomor: data.petak?.nomor ?? null,
    kontakLokasi: data.kontakLokasi,
    dokumen: data.dokumen,
    tagihan: { ...data.tagihan, tautan: deps.dokumenUrl(data.tagihan.link) },
    tautan: deps.pesananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_dikonfirmasi",
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

/** Every logged message about one Pemesanan Makam, oldest first: what its order page shows. */
export async function pesanPemesanan(deps: Pick<PesanKeluargaDeps, "db">, pemesananId: string): Promise<PesanTercatat[]> {
  const rows = await deps.db
    .select()
    .from(notificationsMessage)
    .where(eq(notificationsMessage.pemesananId, pemesananId))
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

/** What the Layanan module announces when a family has just placed an order Layanan. */
export const layananPesananTerbitSchema = z.object({
  pesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  /** The proven Email Terverifikasi, which is where the order's messages go. */
  email: z.email().max(320),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  petak: z.object({ nomor: z.string().trim().min(1).max(60) }),
  item: z.array(z.object({ label: z.string().trim().min(1).max(300), targetDate: z.iso.date() })).min(1).max(10),
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
});
export type LayananPesananTerbitInput = z.infer<typeof layananPesananTerbitSchema>;

/** What the Layanan module announces when a job is finished, with the proof links. */
export const layananPekerjaanSelesaiSchema = z.object({
  pekerjaanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  petak: z.object({ nomor: z.string().trim().min(1).max(60) }),
  label: z.string().trim().min(1).max(300),
  selesaiAt: z.date(),
  bukti: z.array(z.object({ kind: z.enum(buktiPekerjaanValues), url: z.url().max(2048).nullable() })).min(1).max(3),
});
export type LayananPekerjaanSelesaiInput = z.infer<typeof layananPekerjaanSelesaiSchema>;

export type PesanLayananResult = { ok: true } | { ok: false; reason: "layanan_tidak_valid" };

/**
 * Announces an order Layanan to its Pemesan: the Layanan, the dates and the
 * Tagihan, because a standalone Layanan order is paid before the work. One
 * message per order, whatever queues it twice.
 */
export async function layananPesananTerbit(deps: PesanKeluargaDeps, input: LayananPesananTerbitInput): Promise<PesanLayananResult> {
  const parsed = layananPesananTerbitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "layanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = layananPesananTerbitEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    petakNomor: data.petak.nomor,
    item: data.item,
    tagihan: { ...data.tagihan, tautan: deps.dokumenUrl(data.tagihan.link) },
    tautan: deps.layananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "layanan_pesanan_terbit",
    pemesananId: null,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // Transactional: it asks nothing, and a family's proof of what they ordered goes at once.
    sendAfter: now,
  });
  return { ok: true };
}

/**
 * Announces a finished job to its Pemesan with the link to its photo proof. The
 * proof is the whole message: it is why the work is finished, and the family is
 * entitled to see it the moment it exists.
 */
export async function layananPekerjaanSelesai(deps: PesanKeluargaDeps, input: LayananPekerjaanSelesaiInput): Promise<PesanLayananResult> {
  const parsed = layananPekerjaanSelesaiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "layanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = layananPekerjaanSelesaiEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    petakNomor: data.petak.nomor,
    label: data.label,
    selesaiAt: data.selesaiAt,
    bukti: data.bukti.map((satu) => ({ label: labelBuktiPekerjaan(satu.kind), tautan: satu.url })),
    tautan: deps.layananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "layanan_pekerjaan_selesai",
    pemesananId: null,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}

/** Every logged message about one order Layanan, oldest first: what its order page shows. */
export async function pesanLayanan(deps: Pick<PesanKeluargaDeps, "db">, nomorPemesanan: string): Promise<PesanTercatat[]> {
  const rows = await deps.db
    .select()
    .from(notificationsMessage)
    .where(eq(notificationsMessage.nomorPemesanan, nomorPemesanan))
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
