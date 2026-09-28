/**
 * The family message a Saat Duka TPU confirmation sends (ticket 45; spec, story
 * 73 and Notifications): the burial agreed with the TPU, the TPU's own office
 * contact, the Admin Platform who took the order, both document lists, the price
 * lines, and the pay-after Tagihan.
 *
 * It is a template of its own rather than a reuse of a Lokasi Mitra's
 * `pesanan_dikonfirmasi`, for two reasons that are not tidiness: a TPU order is
 * read at `/pengurusan/<nomor>` and not at `/pesanan/<nomor>`, and the email
 * must name the TPU's own office where a Lokasi Mitra's names its Kontak Siaga.
 * One message per order, so a confirmation run twice sends one email.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps, type PesanTercatat } from "./pesan-keluarga";
import { notificationsMessage } from "./schema";
import { bukaTeleponPemesan } from "./telepon-pemesan";
import { pengurusanDikonfirmasiEmail } from "./template";

/** What the Pengurusan module announces when an Admin Platform confirms a TPU order. */
export const pengurusanDikonfirmasiSchema = z.object({
  pengurusanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  /** The Email Terverifikasi the order was proven with; null when the order has none. */
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  tpu: z.object({ name: z.string().trim().min(1).max(200), address: z.string().trim().min(1).max(500) }),
  almarhum: z.object({ name: z.string().trim().min(1).max(200), tanggalWafat: z.iso.date() }),
  /** The burial agreed with the TPU, which the Tagihan's 3×24 h counts from. */
  pemakamanAt: z.date(),
  /** The Admin Platform who took the order, as the family is given them. */
  adminPlatform: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().max(30).nullable() }),
  /** The TPU office's own contact, the number the family may reach it at. */
  kontakTpu: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().min(1).max(30) }),
  /** The one line Admin Platform added for this family; null while none. */
  catatan: z.string().trim().max(500).nullable().default(null),
  /** Both document sets, as the order carries them. */
  dokumen: z.object({
    pemakaman: z.array(z.object({ nama: z.string().trim().min(1).max(200), catatan: z.string().trim().max(300).nullable() })).max(50),
    pengajuan: z.array(z.object({ nama: z.string().trim().min(1).max(200), catatan: z.string().trim().max(300).nullable() })).max(50),
  }),
  /** The price lines the Tagihan carries, named exactly as it names them. */
  harga: z.array(z.object({ kind: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(300), amount: z.number().int() })).min(1).max(20),
  /** The pay-after Tagihan issued with the confirmation. */
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
});
export type PengurusanDikonfirmasiInput = z.infer<typeof pengurusanDikonfirmasiSchema>;

export type PesanPengurusanResult = { ok: true } | { ok: false; reason: "pengurusan_tidak_valid" };

/**
 * Announces a Saat Duka TPU confirmation to its family: the agreed burial, both
 * contacts, both document lists, the price lines and the Tagihan, queued like
 * every family message and sent by the worker's tick. A CS-placed order with no
 * email gets a "Telepon Pemesan" row instead, for the same reason a Lokasi
 * Mitra's confirmation does: the family must hear it, and CS shares the links
 * by hand.
 *
 * Announcing twice changes nothing: one message per order, by the unique index
 * on (order, template).
 */
export async function pengurusanDikonfirmasi(
  deps: PesanKeluargaDeps,
  input: PengurusanDikonfirmasiInput,
): Promise<PesanPengurusanResult> {
  const parsed = pengurusanDikonfirmasiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pengurusan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "pengurusan",
      subjectId: data.pengurusanId,
      nomorPemesanan: data.nomor,
      sebab: "tanpa_email",
      perihal: `Pengurusan ${data.nomor} di ${data.tpu.name} sudah dikonfirmasi: beritahu keluarga jadwal pemakamannya.`,
    });
    return { ok: true };
  }
  const email = pengurusanDikonfirmasiEmail({
    nomor: data.nomor,
    tpu: data.tpu,
    almarhum: data.almarhum,
    pemakamanAt: data.pemakamanAt,
    adminPlatform: data.adminPlatform,
    kontakTpu: data.kontakTpu,
    catatan: data.catatan,
    dokumen: data.dokumen,
    harga: data.harga,
    tagihan: { ...data.tagihan, tautan: deps.dokumenUrl(data.tagihan.link) },
    tautan: deps.pengurusanUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "pengurusan_dikonfirmasi",
    pemesananId: data.pengurusanId,
    nomorPemesanan: data.nomor,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // Transactional: the family has already ordered and the burial is already
    // arranged, so it goes at any hour, like the two Lokasi Mitra order messages.
    sendAfter: now,
  });
  return { ok: true };
}

/** Every logged message about one Pengurusan order, oldest first: what its order page shows. */
export async function pesanPengurusan(deps: Pick<PesanKeluargaDeps, "db">, pengurusanId: string): Promise<PesanTercatat[]> {
  const rows = await deps.db
    .select()
    .from(notificationsMessage)
    .where(eq(notificationsMessage.pemesananId, pengurusanId))
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
