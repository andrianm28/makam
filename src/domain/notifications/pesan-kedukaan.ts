/**
 * The message a Permintaan Kedukaan's filing or status change brings (ADR 0010). Logged against the
 * change's own id, so the one message per change is kept whatever runs twice.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { kedukaanStatusEmail } from "./template";

export const kedukaanStatusBerubahSchema = z.object({
  perubahanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  labelJenis: z.string().trim().min(1).max(100),
  labelStatus: z.string().trim().min(1).max(100),
  catatan: z.string().trim().max(1000).nullable(),
});
export type KedukaanStatusBerubahInput = z.infer<typeof kedukaanStatusBerubahSchema>;
export type KedukaanStatusBerubahResult = { ok: true } | { ok: false; reason: "pesan_tidak_valid" };

export async function kedukaanStatusBerubah(deps: PesanKeluargaDeps, input: KedukaanStatusBerubahInput): Promise<KedukaanStatusBerubahResult> {
  const parsed = kedukaanStatusBerubahSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pesan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const email = kedukaanStatusEmail({ nomor: data.nomor, labelJenis: data.labelJenis, labelStatus: data.labelStatus, catatan: data.catatan });
  await queueFamilyEmail(deps.db, now, {
    template: "kedukaan_status",
    pemesananId: data.perubahanId,
    nomorPemesanan: null,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}
