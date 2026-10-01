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
  pesananAlternatifEmail,
  pesananBuktiPemesananEmail,
  pesananDibatalkanEmail,
  pesananDiajukanEmail,
  pesananDikonfirmasiEmail,
  pesananDitolakEmail,
  layananPekerjaanSelesaiEmail,
  layananPesanBaruEmail,
  layananPesananTerbitEmail,
  layananTpuPesananTerbitEmail,
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

/** What it announces when the Admin Lokasi has declined that order. */
export const pesananDitolakSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  /** The reason off the closed list, already worded by the Pemesanan module. */
  alasan: z.string().trim().min(1).max(300),
  /** The city the rejecting Lokasi Mitra is in, so the list the family is sent back to can be filtered by it. */
  kota: z.string().trim().max(200).nullable(),
  almarhum: almarhumSchema,
  pemesan: z.object({ name: z.string().trim().min(1).max(200), phoneNumber: z.string().trim().max(30).nullable() }),
});
export type PesananDitolakInput = z.infer<typeof pesananDitolakSchema>;

/** What it announces when the Lokasi has offered an alternative the Pemesan must answer. */
export const pesananAlternatifDitawarkanSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  almarhum: almarhumSchema,
  /** What was ordered: either half may be null, never both. */
  dari: z.object({ jenisMakam: z.string().trim().max(200).nullable(), pemakamanAt: z.date().nullable() }),
  /** What is offered instead: either half may be null, never both. */
  ke: z.object({ jenisMakam: z.string().trim().max(200).nullable(), pemakamanAt: z.date().nullable() }),
  total: z.number().int().nonnegative(),
  lines: z.array(z.object({ label: z.string().trim().min(1).max(300), amount: z.number().int() })).min(1).max(30),
});
export type PesananAlternatifDitawarkanInput = z.infer<typeof pesananAlternatifDitawarkanSchema>;

/** What it announces when the order was cancelled, by the family or for them. */
export const pesananDibatalkanSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: z.object({ name: z.string().trim().min(1).max(200) }),
  almarhum: z.object({ name: z.string().trim().min(1).max(200) }),
  /** True when the Admin Lokasi recorded the cancellation for the family. */
  olehLokasi: z.boolean(),
  /** The Tagihan cancelled with the order and the money on its way back. */
  tagihan: z
    .object({
      nomorTagihan: z.string().trim().min(1).max(50),
      dibatalkan: z.boolean(),
      jumlahDikembalikan: z.number().int().nonnegative(),
    })
    .nullable(),
  /** The Petak Makam that went back to the Lokasi Mitra's list, when the order had one. */
  petak: z.object({ nomor: z.string().trim().max(60) }).nullable(),
});
export type PesananDibatalkanInput = z.infer<typeof pesananDibatalkanSchema>;

/** What it announces when a paid order has earned its Bukti Pemesanan. */
export const pesananBuktiPemesananSchema = z.object({
  pemesananId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  lokasi: lokasiSchema,
  bukti: z.object({ nomor: z.string().trim().min(1).max(50), link: z.string().trim().min(1).max(100) }),
  petakNomor: z.string().trim().min(1).max(60),
  pemegangHakName: z.string().trim().min(1).max(200),
  masa: z.object({ mulai: z.iso.date().nullable(), selesai: z.iso.date().nullable(), tahun: z.number().int().min(1).max(200).nullable().optional() }),
});
export type PesananBuktiPemesananInput = z.infer<typeof pesananBuktiPemesananSchema>;

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

/**
 * Announces a Tolak: the reason in the Lokasi's own words and the link back to
 * the Pilih makam list, and — the part the email cannot do — a "Telepon Pemesan"
 * row for **Admin Platform**, whose Tier 1 call is owed within 2 h (spec, Work
 * Queues: "Saat Duka ditolak (call within 2 h)"; story 33).
 *
 * The row has no `lokasiId`, and that is deliberate: a declined family is
 * Admin Platform's to call, not the Lokasi's own staff who just turned it away,
 * and `catatPanggilan` refuses a Lokasi-scoped caller on such a row. An order
 * with no email gets no message to queue and the call is then the only channel.
 */
export async function pesananDitolak(deps: PesanKeluargaDeps, input: PesananDitolakInput): Promise<PesanPemesananResult> {
  const parsed = pesananDitolakSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (data.email) {
    const email = pesananDitolakEmail({
      nomor: data.nomor,
      lokasiName: data.lokasi.name,
      almarhumName: data.almarhum.name,
      alasan: data.alasan,
      tautan: deps.pesananUrl(data.nomor),
      tautanPemesanUlang: deps.pesanUlangUrl(data.nomor),
    });
    await queueFamilyEmail(deps.db, now, {
      template: "pesanan_ditolak",
      pemesananId: data.pemesananId,
      nomorPemesanan: data.nomor,
      lokasiId: data.lokasi.id,
      email: data.email,
      subject: email.subject,
      body: email.body,
      // Transactional: a family that was just turned away hears it at any hour.
      sendAfter: now,
    });
  }
  await bukaTeleponPemesan(deps.db, now, {
    subjectKind: "pemesanan",
    subjectId: data.pemesananId,
    nomorPemesanan: data.nomor,
    // Admin Platform's own call row, never the rejecting Lokasi's.
    lokasiId: null,
    sebab: "saat_duka_ditolak",
    perihal: `Pesanan ${data.nomor} ditolak ${data.lokasi.name} (${data.alasan}). Telepon ${data.pemesan.name} dan tawarkan pilihan lain.`,
  });
  return { ok: true };
}

/**
 * Announces an alternative the Pemesan has to answer: the new all-in total, its
 * lines and the two answers, so one tap decides on the real number. An order
 * with no email has no way to answer, so the Lokasi's own staff call it — the
 * same shape as every other family message that has nowhere to go.
 */
export async function pesananAlternatifDitawarkan(
  deps: PesanKeluargaDeps,
  input: PesananAlternatifDitawarkanInput,
): Promise<PesanPemesananResult> {
  const parsed = pesananAlternatifDitawarkanSchema.safeParse(input);
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
      perihal: `Pesanan ${data.nomor} di ${data.lokasi.name} punya pilihan lain untuk almarhumnya. Telepon keluarga dan tawarkan lewat telepon.`,
    });
    return { ok: true };
  }
  const email = pesananAlternatifEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    almarhumName: data.almarhum.name,
    dariJenisMakamName: data.dari.jenisMakam,
    dariPemakamanAt: data.dari.pemakamanAt,
    keJenisMakamName: data.ke.jenisMakam,
    kePemakamanAt: data.ke.pemakamanAt,
    total: data.total,
    lines: data.lines,
    tautan: deps.pesananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "pesanan_alternatif_ditawarkan",
    pemesananId: data.pemesananId,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // A family must answer this one, so it goes at once whatever the hour is.
    sendAfter: now,
  });
  return { ok: true };
}

/** Announces a cancellation: the Petak that went back, the Tagihan cancelled and the money on its way. */
export async function pesananDibatalkan(deps: PesanKeluargaDeps, input: PesananDibatalkanInput): Promise<PesanPemesananResult> {
  const parsed = pesananDibatalkanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemesanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    // A cancellation nobody was told about is a family that turns up at the gate; that Lokasi's own staff call.
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "pemesanan",
      subjectId: data.pemesananId,
      nomorPemesanan: data.nomor,
      lokasiId: null,
      sebab: "tanpa_email",
      perihal: `Pesanan ${data.nomor} dibatalkan dan tidak bisa dikirim lewat email. Beritahu keluarga agar tidak datang ke ${data.lokasi.name}.`,
    });
    return { ok: true };
  }
  const email = pesananDibatalkanEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    almarhumName: data.almarhum.name,
    olehLokasi: data.olehLokasi,
    petakNomor: data.petak?.nomor ?? null,
    tagihan: data.tagihan ? { nomorTagihan: data.tagihan.nomorTagihan, jumlahDikembalikan: data.tagihan.jumlahDikembalikan } : null,
    tautan: deps.pesananUrl(data.nomor),
  });
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

/**
 * Announces the Bukti Pemesanan of a paid order: the link to the document that
 * proves the right, in the family's own email (ADR 0004). An order with no email
 * opens the call row instead, so the Lokasi's own staff hands the link over or
 * CS does; the message asks nothing, so it goes at any hour.
 */
export async function pesananBuktiPemesanan(
  deps: PesanKeluargaDeps,
  input: PesananBuktiPemesananInput,
): Promise<PesanPemesananResult> {
  const parsed = pesananBuktiPemesananSchema.safeParse(input);
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
      perihal: `Pesanan ${data.nomor} di ${data.lokasi.name} sudah lunas: serahkan Bukti Pemesanan ${data.bukti.nomor} kepada keluarga.`,
    });
    return { ok: true };
  }
  const email = pesananBuktiPemesananEmail({
    nomor: data.nomor,
    lokasiName: data.lokasi.name,
    bukti: { nomor: data.bukti.nomor, tautan: deps.dokumenUrl(data.bukti.link) },
    petakNomor: data.petakNomor,
    pemegangHakName: data.pemegangHakName,
    masa: data.masa,
    tautan: deps.pesananUrl(data.nomor),
  });
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

/** What the Layanan module announces when a family has just placed an order Layanan at a DKI TPU (ticket 56). */
export const layananTpuPesananTerbitSchema = z.object({
  nomor: z.string().trim().min(1).max(50),
  /** The proven Email Terverifikasi, which is where the order's messages go. */
  email: z.email().max(320),
  pemesanName: z.string().trim().min(1).max(200),
  tpu: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }),
  makam: z.object({ blokNomor: z.string().trim().min(1).max(200) }),
  item: z.array(z.object({ label: z.string().trim().min(1).max(300), targetDate: z.iso.date() })).min(1).max(10),
  tagihan: z.object({
    nomorTagihan: z.string().trim().min(1).max(50),
    total: z.number().int().nonnegative(),
    dueAt: z.date(),
    link: z.string().trim().min(1).max(100),
  }),
});
export type LayananTpuPesananTerbitInput = z.infer<typeof layananTpuPesananTerbitSchema>;

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

/** What the Layanan module announces when a staff member or the fulfiller writes in a job's thread (ticket 52). */
export const layananPesanBaruSchema = z.object({
  pekerjaanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  pemesanName: z.string().trim().min(1).max(200),
  pengirim: z.enum(["admin_lokasi", "mitra_jasa", "admin_platform"]),
  label: z.string().trim().min(1).max(300),
  tempatName: z.string().trim().min(1).max(200),
  lokasi: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }).nullable(),
});
export type LayananPesanBaruInput = z.infer<typeof layananPesanBaruSchema>;

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
 * Announces an order Layanan at a DKI TPU to its Pemesan: the Layanan, the dates and
 * the Tagihan (ticket 56). It is the same event and the same template key as a Lokasi
 * Mitra's order, but it carries **no Lokasi Mitra**: a TPU is nobody's Lokasi, so the
 * message names no `lokasiId` and a failed send never opens a row for an Admin Lokasi.
 */
export async function layananTpuPesananTerbit(deps: PesanKeluargaDeps, input: LayananTpuPesananTerbitInput): Promise<PesanLayananResult> {
  const parsed = layananTpuPesananTerbitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "layanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = layananTpuPesananTerbitEmail({
    nomor: data.nomor,
    tpuName: data.tpu.name,
    blokNomor: data.makam.blokNomor,
    item: data.item,
    tagihan: { ...data.tagihan, tautan: deps.dokumenUrl(data.tagihan.link) },
    tautan: deps.layananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "layanan_pesanan_terbit",
    pemesananId: null,
    nomorPemesanan: data.nomor,
    lokasiId: null,
    email: data.email,
    subject: email.subject,
    body: email.body,
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

/**
 * Tells the Pemesan a new message arrived in a job's thread (ticket 52). The email
 * carries a link and no content: the text and photos stay in the app, and no contact
 * detail travels either. Transactional, so it goes at any hour.
 */
export async function layananPesanBaru(deps: PesanKeluargaDeps, input: LayananPesanBaruInput): Promise<PesanLayananResult> {
  const parsed = layananPesanBaruSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "layanan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = layananPesanBaruEmail({
    nomor: data.nomor,
    tempatName: data.tempatName,
    label: data.label,
    pengirim: data.pengirim,
    tautan: deps.layananUrl(data.nomor),
  });
  await queueFamilyEmail(deps.db, now, {
    template: "layanan_pesan_baru",
    pemesananId: null,
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi?.id ?? null,
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
