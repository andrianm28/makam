/**
 * The IPTM expiry reminders (spec, Notifications: "IPTM expiry, 3 months and 1 month before"; ticket 48). The
 * Pengurusan module decides which reminder is due and for which Makam TPU; this module queues the email to the Pemegang
 * Hak, once per reminder (the key), waiting for 08:00-20:00 WIB like every message that asks something.
 */
import { z } from "zod";
import { formatTanggal } from "@/lib/time/jakarta";
import { tundaSampaiJamKirim } from "./acara";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { bukaTeleponPemesan } from "./telepon-pemesan";
import { iptmBerakhirEmail } from "./template";

export const pengingatIptmBerakhirSchema = z.object({
  makamTpuId: z.uuid(),
  /** Names this reminder (expiry date and stage), so announcing it twice sends it once. */
  kunci: z.string().trim().min(1).max(100),
  tpuName: z.string().trim().min(1).max(200),
  blokNomor: z.string().trim().min(1).max(200),
  pemegangHakName: z.string().trim().min(1).max(200).nullable(),
  /** The Pemegang Hak's or the Akun's email; null when neither is known, and then a Telepon Pemesan row is opened instead. */
  email: z.email().max(320).nullable(),
  berlakuSampai: z.iso.date(),
  sisaBulan: z.union([z.literal(3), z.literal(1)]),
  tautan: z.string().trim().min(1).max(500),
});
export type PengingatIptmBerakhirInput = z.infer<typeof pengingatIptmBerakhirSchema>;

export type PengingatIptmBerakhirResult = { ok: true } | { ok: false; reason: "pengingat_tidak_valid" };

/** Announces one reminder that a Makam TPU's IPTM is ending. Announcing the same one twice changes nothing. */
export async function pengingatIptmBerakhir(deps: PesanKeluargaDeps, input: PengingatIptmBerakhirInput): Promise<PengingatIptmBerakhirResult> {
  const parsed = pengingatIptmBerakhirSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pengingat_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    // One open row per Makam TPU; a reminder that already opened one (closed since) does not open another.
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "makam_tpu",
      subjectId: data.makamTpuId,
      sebab: "tanpa_email",
      kunci: data.kunci,
      perihal: `IPTM makam ${data.blokNomor} di ${data.tpuName} berakhir ${formatTanggal(data.berlakuSampai)} dan tidak ada email tercatat: telepon Pemegang Hak${data.pemegangHakName ? ` (${data.pemegangHakName})` : ""}, ingatkan Perpanjangan TPU.`,
    });
    return { ok: true };
  }
  const email = iptmBerakhirEmail(data);
  await queueFamilyEmail(deps.db, now, {
    template: "iptm_berakhir_pengingat",
    pemesananId: `${data.makamTpuId}:${data.kunci}`,
    nomorPemesanan: null,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: tundaSampaiJamKirim(now),
  });
  return { ok: true };
}
