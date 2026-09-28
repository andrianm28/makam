/**
 * The one family message a refund brings (ticket 31, AC 4: "its link is sent to
 * the Pemesan").
 *
 * It is a **money** message about a **Tagihan**, so two rules of this module
 * apply and neither is a choice:
 *
 * - it is logged against the Tagihan, so the order page shows the family the
 *   record of its own money coming back, and a refund that never reached the
 *   family is visible rather than silent;
 * - a send that finally fails opens a **Telepon Pemesan** row with no
 *   `lokasiId`, which routes the call to **Admin Platform** rather than to the
 *   Lokasi whose work was refunded. Nobody at that Lokasi can hand a family money
 *   back, so they are not the ones to chase (spec, Notifications).
 *
 * Transactional, like a Bukti Pembayaran: the transfer has already happened, the
 * message asks nothing, and a family waiting on its own money is not served by a
 * morning window. Queued first and sent by the worker's tick, retried, and one
 * message per Tagihan per template however often the Bukti is announced.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { buktiPengembalianEmail } from "./template";
import { bukaTeleponPemesan } from "./telepon-pemesan";

/** What the Refunds flow (Payouts) tells Notifications once a refund is transferred. */
export const buktiPengembalianSchema = z.object({
  /** The Tagihan the refund reverses, as a plain id: the message is logged against it. */
  tagihanId: z.uuid(),
  nomorTagihan: z.string().trim().min(1).max(50),
  nomorPemesanan: z.string().trim().min(1).max(50).nullable(),
  /** The Email Terverifikasi the family reads; null when the order was placed without one. */
  email: z.email().max(320).nullable(),
  pemesanName: z.string().trim().min(1).max(200),
  nomorBukti: z.string().trim().min(1).max(50),
  /** Whole rupiah that went back. */
  jumlah: z.number().int().nonnegative(),
  /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD"). */
  ditransferPada: z.iso.date(),
  /** Whether the Biaya Layanan Platform came back too, which the email states. */
  biayaLayananPlatformDikembalikan: z.boolean(),
  /** The Bukti Pengembalian Dana page's full URL. */
  url: z.url(),
});
export type BuktiPengembalianInput = z.infer<typeof buktiPengembalianSchema>;

export type PesanBuktiPengembalianResult = { ok: true } | { ok: false; reason: "pengembalian_tidak_valid" };

/**
 * Announces a Bukti Pengembalian Dana to the Pemesan it was paid to. A family
 * with no email gets the call row instead, and CS shares the document link by
 * hand — the same rule a Tagihan on issue and a Bukti Pembayaran both follow.
 */
export async function buktiPengembalianTerbit(
  deps: PesanKeluargaDeps,
  input: BuktiPengembalianInput,
): Promise<PesanBuktiPengembalianResult> {
  const parsed = buktiPengembalianSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pengembalian_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  if (!data.email) {
    await bukaTeleponPemesan(deps.db, now, {
      subjectKind: "tagihan",
      subjectId: data.tagihanId,
      nomorTagihan: data.nomorTagihan,
      nomorPemesanan: data.nomorPemesanan,
      // No `lokasiId`: the money went back to the family, so the call is Admin
      // Platform's and not that Lokasi Mitra's Admin Lokasi's.
      sebab: "tanpa_email",
      perihal: `Pengembalian dana ${data.nomorBukti} untuk Tagihan ${data.nomorTagihan} tidak bisa dikirim lewat email: `
        + `beritahu keluarga uangnya sudah dikembalikan.`,
    });
    return { ok: true };
  }
  const email = buktiPengembalianEmail({
    nomorBukti: data.nomorBukti,
    nomorTagihan: data.nomorTagihan,
    jumlah: data.jumlah,
    ditransferPada: data.ditransferPada,
    biayaLayananPlatformDikembalikan: data.biayaLayananPlatformDikembalikan,
    tautan: data.url,
  });
  await queueFamilyEmail(deps.db, now, {
    template: "bukti_pengembalian_terbit",
    pemesananId: null,
    tagihanId: data.tagihanId,
    nomorTagihan: data.nomorTagihan,
    nomorPemesanan: data.nomorPemesanan,
    email: data.email,
    subject: email.subject,
    body: email.body,
    // Transactional, so it asks nothing: it goes at any hour, like a Bukti Pembayaran.
    sendAfter: now,
  });
  return { ok: true };
}
