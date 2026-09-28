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
import { queueFamilyEmail, type PesanKeluargaDeps, type PesanTercatat } from "./pesan-tagihan";
import { notificationsMessage } from "./schema";
import { bukaTeleponPemesan } from "./telepon-pemesan";
import {
  pesananDiajukanEmail,
  pesananDikonfirmasiEmail,
  terencanaDibatalkanEmail,
  terencanaDikonfirmasiEmail,
  terencanaDitolakEmail,
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

/** A confirmed Terencairan, as its family is told about it. */
export const terencanaDikonfirmasiSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  unit: z.array(z.object({ jenis: z.enum(["petak", "kavling"]), nomor: z.string().trim().min(1).max(60) })).min(1).max(50),
  calon: z.object({ name: z.string().trim().min(1).max(200) }),
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
  kontakLokasi: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().max(30).nullable() }).nullable(),
});
export type TerencanaDikonfirmasiInput = z.infer<typeof terencanaDikonfirmasiSchema>;

/** A declined Terencairan, as its family is told about it. */
export const terencanaDitolakSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  alasan: z.string().trim().min(1).max(300),
});
export type TerencanaDitolakInput = z.infer<typeof terencanaDitolakSchema>;

/** A Terencairan that ended with no right, as its family is told about it. */
export const terencanaDibatalkanSchema = terencanaDitolakSchema;
export type TerencanaDibatalkanInput = z.infer<typeof terencanaDibatalkanSchema>;

/**
 * Announces the Lokasi's confirmation of a Pemesanan Terencana: the plots, the Calon
 * Penghuni, whom to call, and the pay-first Tagihan whose due date is the hold's end.
 * Like every family message about a Lokasi Mitra's own work, a send that finally fails
 * opens the call row in that Lokasi's Antrean Lokasi.
 */
export async function terencanaDikonfirmasi(deps: PesanKeluargaDeps, input: TerencanaDikonfirmasiInput): Promise<PesanPemesananResult> {
  const parsed = terencanaDikonfirmasiSchema.safeParse(input);
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
      perihal: `Pesanan terencana ${data.nomor} di ${data.lokasi.name} sudah dikonfirmasi: beritahu keluarga petaknya dan batas pembayarannya.`,
    });
    return { ok: true };
  }
  const email = terencanaDikonfirmasiEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    unit: data.unit.map((satu) => satu.nomor),
    calon: data.calon.name,
    tagihan: { ...data.tagihan, tautan: deps.dokumenUrl(data.tagihan.link) },
    kontakLokasi: data.kontakLokasi,
    tautan: deps.pesananUrl(data.nomor),
    tautanPilihLokasi: deps.terencanaWizardUrl(),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "terencana_dikonfirmasi",
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

/**
 * Announces the Lokasi's decline of a Pemesanan Terencana: the reason, that nothing was
 * paid, and the wizard's Lokasi step to pick again (spec, story 49).
 */
export async function terencanaDitolak(deps: PesanKeluargaDeps, input: TerencanaDitolakInput): Promise<PesanPemesananResult> {
  const parsed = terencanaDitolakSchema.safeParse(input);
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
      perihal: `Pesanan terencana ${data.nomor} di ${data.lokasi.name} ditolak: beritahu keluarga alasannya.`,
    });
    return { ok: true };
  }
  const email = terencanaDitolakEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    alasan: data.alasan,
    tautan: deps.pesananUrl(data.nomor),
    tautanPilihLokasi: deps.terencanaWizardUrl(),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "terencana_ditolak",
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

/**
 * Announces a Pemesanan Terencana that ended with no right — the Pemesan withdrew, or
 * the payment hold ran out. Nothing was charged either way, and it says so.
 */
export async function terencanaDibatalkan(deps: PesanKeluargaDeps, input: TerencanaDibatalkanInput): Promise<PesanPemesananResult> {
  const parsed = terencanaDibatalkanSchema.safeParse(input);
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
      perihal: `Pesanan terencana ${data.nomor} di ${data.lokasi.name} dibatalkan: beritahu tidak ada yang dibayar.`,
    });
    return { ok: true };
  }
  const email = terencanaDibatalkanEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    alasan: data.alasan,
    tautan: deps.pesananUrl(data.nomor),
    tautanPilihLokasi: deps.terencanaWizardUrl(),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "terencana_dibatalkan",
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
