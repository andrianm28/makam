/**
 * The Hak Pakai end reminders (spec, Notifications: "Hak Pakai end, to the Pemegang Hak and the Admin Lokasi,
 * 60, 30 and 7 days before, then weekly in the masa tenggang"; ADR 0004; ticket 42). The Perpanjangan module
 * decides which reminder is due and when; this module picks the recipients' channels and logs the messages.
 *
 * - The Pemegang Hak gets an email to the address recorded on the Hak Pakai, with the Perpanjangan link. It is
 *   queued once per reminder (the stage key) and waits for 08:00-20:00 WIB like every message that asks something.
 * - Every Admin Lokasi of the Lokasi gets a Peringatan Staf (push and email), queued once per reminder.
 * - A "Telepon Pemesan" row opens in the Antrean Lokasi when the Hak Pakai has no recorded email, and, per the
 *   Perpanjangan module's say-so (`teleponPemesan`), when it is nearing its end: one open row per Hak Pakai.
 */
import { z } from "zod";
import { formatTanggal } from "@/lib/time/jakarta";
import { tundaSampaiJamKirim } from "./acara";
import { antrekanPeringatanStaf } from "./peringatan-staf";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { hakPakaiBerakhirEmail } from "./template";
import { bukaTeleponPemesan } from "./telepon-pemesan";

export const pengingatHakPakaiBerakhirSchema = z.object({
  hakPakaiId: z.uuid(),
  /** Names this reminder (end date and stage), so announcing it twice sends it once. */
  kunci: z.string().trim().min(1).max(100),
  lokasi: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }),
  /** The plot as named in text (`labelSatuanHakPakai`). */
  satuan: z.string().trim().min(1).max(300),
  pemegangHakName: z.string().trim().min(1).max(200).nullable(),
  /** The email recorded on the Hak Pakai; null when there is none. */
  email: z.email().max(320).nullable(),
  endDate: z.iso.date(),
  /** Days from today to the end date; zero or negative once it has passed (the Masa Tenggang). */
  sisaHari: z.number().int(),
  masaTenggangBerakhir: z.iso.date(),
  tautan: z.string().trim().min(1).max(500),
  /** Every Admin Lokasi of the Lokasi, who also hears of the reminder. */
  adminLokasi: z.array(z.object({ accountId: z.string().trim().min(1) })),
  /** True when the Hak Pakai is nearing its end, which asks for a call as well (ADR 0004). */
  teleponPemesan: z.boolean(),
});
export type PengingatHakPakaiBerakhirInput = z.infer<typeof pengingatHakPakaiBerakhirSchema>;

export type PengingatHakPakaiBerakhirResult = { ok: true } | { ok: false; reason: "pengingat_tidak_valid" };

/** Announces one reminder of a Hak Pakai's end. Announcing the same one twice changes nothing. */
export async function pengingatHakPakaiBerakhir(deps: PesanKeluargaDeps, input: PengingatHakPakaiBerakhirInput): Promise<PengingatHakPakaiBerakhirResult> {
  const parsed = pengingatHakPakaiBerakhirSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pengingat_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const judul = data.sisaHari > 0 ? `berakhir ${data.sisaHari} hari lagi` : "masa berlakunya sudah habis";

  if (data.email) {
    const email = hakPakaiBerakhirEmail({
      lokasiName: data.lokasi.name,
      satuan: data.satuan,
      pemegangHakName: data.pemegangHakName,
      endDate: data.endDate,
      sisaHari: data.sisaHari,
      masaTenggangBerakhir: data.masaTenggangBerakhir,
      tautan: data.tautan,
    });
    await queueFamilyEmail(deps.db, now, {
      template: "hak_pakai_berakhir_pengingat",
      pemesananId: `${data.hakPakaiId}:${data.kunci}`,
      nomorPemesanan: null,
      lokasiId: data.lokasi.id,
      email: data.email,
      subject: email.subject,
      body: email.body,
      sendAfter: tundaSampaiJamKirim(now),
    });
  }

  for (const admin of data.adminLokasi) {
    await antrekanPeringatanStaf(deps.db, deps.clock, {
      to: { accountId: admin.accountId },
      kind: "staf_hak_pakai_berakhir",
      email: {
        subject: `Hak Pakai ${data.satuan} ${judul}`,
        text: `Hak Pakai ${data.satuan} di ${data.lokasi.name} ${judul} (tanggal berakhir ${formatTanggal(data.endDate)}; Perpanjangan diterima sampai ${formatTanggal(data.masaTenggangBerakhir)}). Perpanjangan: ${data.tautan}`,
      },
      push: { title: "Hak Pakai segera berakhir", body: `${data.satuan} di ${data.lokasi.name} ${judul}.`, url: `/staf/admin-lokasi/${data.lokasi.id}/hak-pakai/${data.hakPakaiId}` },
      subject: { kind: "hak_pakai", id: data.hakPakaiId },
    });
  }

  if (!data.email || data.teleponPemesan) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "hak_pakai",
      subjectId: data.hakPakaiId,
      lokasiId: data.lokasi.id,
      sebab: data.email ? "hak_pakai_berakhir" : "tanpa_email",
      perihal: data.email
        ? `Hak Pakai ${data.satuan} di ${data.lokasi.name} ${judul}: telepon Pemegang Hak, ingatkan Perpanjangan.`
        : `Hak Pakai ${data.satuan} di ${data.lokasi.name} ${judul} dan tidak ada email tercatat: telepon Pemegang Hak, ingatkan Perpanjangan.`,
    });
  }
  return { ok: true };
}
