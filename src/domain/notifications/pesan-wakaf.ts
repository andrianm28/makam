/**
 * The message a Pengajuan Wakaf's status change brings (spec, Wakaf: "each status change sent to the
 * Wakif by email"; ADR 0004; ticket 58). Logged against the status change's own id, so the one
 * message per change is kept whatever runs twice, and a Pengajuan moving through six statuses sends six.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { wakafStatusEmail } from "./template";

export const wakafStatusBerubahSchema = z.object({
  perubahanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  labelStatus: z.string().trim().min(1).max(100),
  tanggal: z.iso.date().nullable(),
  alasan: z.string().trim().max(1000).nullable(),
  catatan: z.string().trim().max(2000).nullable(),
});
export type WakafStatusBerubahInput = z.infer<typeof wakafStatusBerubahSchema>;
export type WakafStatusBerubahResult = { ok: true } | { ok: false; reason: "pesan_tidak_valid" };

export async function wakafStatusBerubah(deps: PesanKeluargaDeps, input: WakafStatusBerubahInput): Promise<WakafStatusBerubahResult> {
  const parsed = wakafStatusBerubahSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pesan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = wakafStatusEmail({
    nomor: data.nomor,
    labelStatus: data.labelStatus,
    tanggal: data.tanggal,
    alasan: data.alasan,
    catatan: data.catatan,
  });
  await queueFamilyEmail(deps.db, now, {
    template: "wakaf_status",
    pemesananId: data.perubahanId,
    nomorPemesanan: null,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}
