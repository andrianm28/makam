/**
 * The notice of a Lokasi Mitra's Berhenti decision (ticket 59): every family with an order or a Paket Layanan
 * there is emailed at once, with the effective date. The caller names the families (who has an order is the
 * Pemesanan and Layanan modules' fact); this module picks template, channel and timing, and logs each message.
 * A family with no email is skipped: the Lokasi's staff reach it by phone, as for any order without email.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { lokasiBerhentiEmail } from "./template";

export const lokasiBerhentiSchema = z.object({
  lokasi: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }),
  berlakuOn: z.iso.date(),
  penerima: z
    .array(z.object({ kunci: z.string().trim().min(1).max(100), nomor: z.string().trim().min(1).max(50), email: z.email().max(320).nullable() }))
    .max(5000),
});
export type LokasiBerhentiInput = z.input<typeof lokasiBerhentiSchema>;
export type LokasiBerhentiResult = { ok: true; diberitahu: number } | { ok: false; reason: "pemberitahuan_tidak_valid" };

/** Queues one email per family; announcing again queues nothing new (one message per order and template). */
export async function lokasiBerhenti(deps: PesanKeluargaDeps, input: LokasiBerhentiInput): Promise<LokasiBerhentiResult> {
  const parsed = lokasiBerhentiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pemberitahuan_tidak_valid" };
  const { lokasi, berlakuOn, penerima } = parsed.data;
  const now = deps.clock.now();
  let diberitahu = 0;
  for (const satu of penerima) {
    if (!satu.email) continue;
    const surat = lokasiBerhentiEmail({ lokasiName: lokasi.name, nomor: satu.nomor, berlakuOn });
    const antre = await queueFamilyEmail(deps.db, now, {
      template: "lokasi_berhenti",
      pemesananId: satu.kunci,
      nomorPemesanan: satu.nomor,
      lokasiId: lokasi.id,
      email: satu.email,
      subject: surat.subject,
      body: surat.body,
      sendAfter: now,
    });
    if (antre) diberitahu += 1;
  }
  return { ok: true, diberitahu };
}
