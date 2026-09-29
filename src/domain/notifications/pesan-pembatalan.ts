/**
 * The family messages of a Pembatalan of a paid Pemesanan Terencana (ticket 38; spec,
 * Pemesanan > Requests from the Pemegang Hak, Notifications): the Admin Lokasi's answer to the
 * Pemegang Hak's request (approved, declined, or sent back for a fix), and the ask to the Pemesan
 * who paid to enter the bank account the refund goes to (ADR 0004: by email, never WhatsApp).
 *
 * Queued like every family message, in the caller's own transaction when it passes one, logged
 * on the order and retried from the worker. **One message per request per event**: a request can
 * be sent back for a fix more than once, and a Pemesan may be the Pemegang Hak too, so the
 * message's subject key names the request, the event, the round and the reader; a second
 * announcement of the same thing is a no-op, and a second round is a message of its own.
 */
import { z } from "zod";
import { queueFamilyEmail, type PesanKeluargaDeps } from "./pesan-keluarga";
import { pembatalanTerencanaEmail } from "./template-terencana";

const dasar = {
  permintaanId: z.uuid(),
  nomor: z.string().trim().min(1).max(50),
  email: z.email().max(320),
  lokasi: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }),
  unit: z.array(z.object({ nomor: z.string().trim().min(1).max(60), jenisMakamName: z.string().trim().min(1).max(200) })).min(1).max(100),
};

/**
 * What the Pemesanan module announces about a Pembatalan. `disetujui` is sent to the Pemesan who
 * paid (asked for a bank account when there is a refund) and, when the Pemegang Hak who asked is
 * somebody else, to that person too (told where the money goes).
 */
export const pembatalanTerencanaSchema = z.discriminatedUnion("peristiwa", [
  z.object({
    ...dasar,
    peristiwa: z.literal("disetujui"),
    /** Whom the message is to: the Pemesan who paid, who owes the bank account, or the Pemegang Hak who asked. */
    kepada: z.enum(["pemesan", "pemohon"]),
    persenRefund: z.number().int().min(0).max(100),
    jumlahRefund: z.number().int().nonnegative(),
    dalamMasaPembatalan: z.boolean(),
  }),
  z.object({ ...dasar, peristiwa: z.literal("ditolak"), alasan: z.string().trim().min(1).max(500) }),
  z.object({ ...dasar, peristiwa: z.literal("perlu_perbaikan"), putaran: z.number().int().min(1).max(1000), catatan: z.string().trim().min(1).max(500) }),
]);
export type PembatalanTerencanaInput = z.input<typeof pembatalanTerencanaSchema>;

export type PesanPembatalanResult = { ok: true } | { ok: false; reason: "pembatalan_tidak_valid" };

/** The account form and the Makam tab the Pemegang Hak works from, resolved against the order page's own origin. */
function tautanMakamSaya(deps: Pick<PesanKeluargaDeps, "pesananUrl">, nomor: string): string {
  return new URL("/akun/makam", deps.pesananUrl(nomor)).toString();
}

/** The message's own key in the log: unique per request, event, round and reader. */
function kunciPesan(data: z.output<typeof pembatalanTerencanaSchema>): string {
  const dasarKunci = `pembatalan:${data.permintaanId}:${data.peristiwa}`;
  if (data.peristiwa === "disetujui") return `${dasarKunci}:${data.kepada}`;
  if (data.peristiwa === "perlu_perbaikan") return `${dasarKunci}:${data.putaran}`;
  return dasarKunci;
}

/** Validates one announcement and queues its one email at once (each is an answer the family is waiting for, so none waits for a window). */
export async function pembatalanTerencana(deps: PesanKeluargaDeps, input: PembatalanTerencanaInput): Promise<PesanPembatalanResult> {
  const parsed = pembatalanTerencanaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "pembatalan_tidak_valid" };
  const data = parsed.data;
  const now = deps.clock.now();
  const surat = pembatalanTerencanaEmail(
    data.peristiwa === "disetujui"
      ? {
          peristiwa: "disetujui",
          kepada: data.kepada,
          nomor: data.nomor,
          lokasiName: data.lokasi.name,
          unit: data.unit,
          persenRefund: data.persenRefund,
          jumlahRefund: data.jumlahRefund,
          dalamMasaPembatalan: data.dalamMasaPembatalan,
          tautan: deps.pesananUrl(data.nomor),
        }
      : data.peristiwa === "ditolak"
        ? { peristiwa: "ditolak", nomor: data.nomor, lokasiName: data.lokasi.name, unit: data.unit, alasan: data.alasan, tautan: tautanMakamSaya(deps, data.nomor) }
        : {
            peristiwa: "perlu_perbaikan",
            nomor: data.nomor,
            lokasiName: data.lokasi.name,
            unit: data.unit,
            catatan: data.catatan,
            tautan: tautanMakamSaya(deps, data.nomor),
          },
  );
  await queueFamilyEmail(deps.db, now, {
    template: "pembatalan_terencana",
    pemesananId: kunciPesan(data),
    nomorPemesanan: data.nomor,
    lokasiId: data.lokasi.id,
    email: data.email,
    subject: surat.subject,
    body: surat.body,
    sendAfter: now,
  });
  return { ok: true };
}
