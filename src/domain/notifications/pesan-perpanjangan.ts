/**
 * The message a paid Perpanjangan brings (spec, Billing > Documents: the Bukti
 * Perpanjangan "goes by email"; ADR 0004; ticket 40). The Tagihan itself is
 * announced through `tagihanTerbit` like every pay-first Tagihan.
 *
 * It is logged against the Perpanjangan's own id, never the Tagihan's: a message
 * about a Tagihan is dropped once that Tagihan stops waiting for money, and the
 * Tagihan of a paid Perpanjangan is Lunas by definition.
 */
import { z } from "zod";
import { bukaTeleponPemesan } from "./telepon-pemesan";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { buktiPerpanjanganEmail } from "./template";

export const buktiPerpanjanganTerbitSchema = z.object({
  perpanjanganId: z.uuid(),
  /** The email the Perpanjangan was proven with; null when there is none (the call row then hands the link over). */
  email: z.email().max(320).nullable(),
  lokasi: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }),
  bukti: z.object({ nomor: z.string().trim().min(1).max(50), link: z.string().trim().min(1).max(100) }),
  petakNomor: z.string().trim().min(1).max(300),
  pemegangHakName: z.string().trim().min(1).max(200),
  endDateLama: z.iso.date(),
  endDateBaru: z.iso.date(),
  terms: z.number().int().min(1),
});
export type BuktiPerpanjanganTerbitInput = z.infer<typeof buktiPerpanjanganTerbitSchema>;

export type BuktiPerpanjanganTerbitResult = { ok: true } | { ok: false; reason: "perpanjangan_tidak_valid" };

/**
 * Announces the Bukti Perpanjangan of a paid Perpanjangan: the link to the
 * document, by email, at any hour (it asks nothing). With no email a call row
 * opens for the Lokasi's staff to hand the link over. Announcing twice changes
 * nothing: one message per Perpanjangan.
 */
export async function buktiPerpanjanganTerbit(
  deps: PesanKeluargaDeps,
  input: BuktiPerpanjanganTerbitInput,
): Promise<BuktiPerpanjanganTerbitResult> {
  const parsed = buktiPerpanjanganTerbitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "perpanjangan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "pemesanan",
      subjectId: data.perpanjanganId,
      lokasiId: data.lokasi.id,
      sebab: "tanpa_email",
      perihal: `Perpanjangan Petak Makam ${data.petakNomor} di ${data.lokasi.name} sudah lunas: serahkan Bukti Perpanjangan ${data.bukti.nomor} kepada Pemegang Hak.`,
    });
    return { ok: true };
  }
  const email = buktiPerpanjanganEmail({
    lokasiName: data.lokasi.name,
    bukti: { nomor: data.bukti.nomor, tautan: deps.dokumenUrl(data.bukti.link) },
    petakNomor: data.petakNomor,
    pemegangHakName: data.pemegangHakName,
    endDateLama: data.endDateLama,
    endDateBaru: data.endDateBaru,
    terms: data.terms,
  });
  await queueFamilyEmail(deps.db, now, {
    template: "bukti_perpanjangan_terbit",
    pemesananId: data.perpanjanganId,
    nomorPemesanan: null,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: email.subject,
    body: email.body,
    sendAfter: now,
  });
  return { ok: true };
}
