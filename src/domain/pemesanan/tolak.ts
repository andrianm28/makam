/**
 * Answering a Saat Duka order the Lokasi cannot serve (spec, Pemesanan > Saat
 * Duka: "Tawarkan alternatif … and Tolak with a fixed reason list"; story 118;
 * ticket 24). Two answers, and both end with the family never left alone:
 *
 * - **Tolak** with a reason off the closed list of `./alasan-tolak.ts`. The
 *   order becomes Ditolak, the Lokasi's own Antrean Lokasi row closes by
 *   itself, the family is emailed the reason with a link back to Pilih makam,
 *   and Admin Platform gets a Tier 1 row to phone them within 2 h.
 * - **The Lokasi offers an alternative** instead (`./alternatif.ts`): the order
 *   stays Diajukan and waits for the Pemesan's one tap — and refusing that offer
 *   is this same Tolak, reached from the other side, with the reason
 *   "alternatif_ditolak" off the same list.
 *
 * A Saat Duka order holds no plot and is billed nothing until it is confirmed
 * (spec: "nothing is billed at submission"), so a Tolak writes one row of this
 * module and nothing of a neighbour's: there is no Petak to give back and no
 * Tagihan to cancel here. The opposite of a Ditolak order is therefore never a
 * half state — it is an order that is still Diajukan.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { refusable } from "@/db/unit-of-work";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Database } from "@/db/client";
import { ALASAN_TOLAK, alasanTolakSchema, type AlasanTolak } from "./alasan-tolak";
import type { PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** What the Admin Lokasi's Tolak form sends. */
export const tolakSaatDukaSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** Off the closed list and from nowhere else: `./alasan-tolak.ts`. */
  alasan: alasanTolakSchema,
});
export type TolakSaatDukaInput = z.infer<typeof tolakSaatDukaSchema>;

export type TolakSaatDukaResult =
  | { ok: true; pesanan: { nomor: string; status: "ditolak"; alasan: AlasanTolak } }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The order has moved on (confirmed, already declined, cancelled): a Tolak changes nothing. */
  | { ok: false; reason: "pesanan_sudah_ditutup" };

/** What the two answers to a Diajukan order have in common, as this file reads it. */
type OrderSaatDuka = typeof pemesananMakam.$inferSelect;

/**
 * Declines one Diajukan order with a reason off the fixed list, audited on the
 * Lokasi, and tells the family: the email with the rebook link, and the Tier 1
 * call row for Admin Platform.
 *
 * Only that Lokasi's own Admin Lokasi may decline: Admin Platform chases the
 * Lokasi by phone (its Tier 1 "Konfirmasi Lokasi terlambat" row) but never
 * answers for it, as it never confirms for it either.
 */
export async function tolakSaatDuka(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<TolakSaatDukaResult> {
  const parsed = tolakSaatDukaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  // The order names the Lokasi whose orders this is, so the check is made
  // against that Lokasi (a read, never a write).
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.tolak", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const now = deps.clock.now();
  const ditolak = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    if (!(await tulisTolak(tx, order.id, input.alasan, now))) return { ok: false as const, reason: "pesanan_sudah_ditutup" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.tolak",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", alasanTolak: order.alasanTolak },
      after: { status: "ditolak", alasan: input.alasan },
      reason: ALASAN_TOLAK[input.alasan],
    });
    return { ok: true as const };
  });
  if (!ditolak.ok) return ditolak;

  await umumkanTolak(deps, order, input.alasan);
  return { ok: true, pesanan: { nomor: order.nomor, status: "ditolak", alasan: input.alasan } };
}

/**
 * The same Tolak, reached by the family refusing the alternative the Lokasi
 * offered (story 31: "declining becomes a Tolak"). No Entri Audit, because a
 * family acting on its own order is not a staff write — as placing it and adding
 * its documents are not either — and the order row is all it changes.
 */
export async function tolakDenganAlasan(
  deps: PemesananDeps,
  pesananId: string,
  alasan: AlasanTolak,
): Promise<
  | { ok: true; pesanan: { nomor: string; status: "ditolak"; alasan: AlasanTolak } }
  | { ok: false; reason: "pesanan_tidak_ditemukan" | "pesanan_sudah_ditutup" }
> {
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.id, pesananId));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  // `{ ok: false }` is a refusal to `refusable`, so a losing race rolls back
  // instead of leaving a half-written decline behind.
  const ditolak = await refusable(deps.db, async (tx) => ({ ok: await tulisTolak(tx, order.id, alasan, deps.clock.now()) }));
  if (!ditolak.ok) return { ok: false, reason: "pesanan_sudah_ditutup" };

  await umumkanTolak(deps, order, alasan);
  return { ok: true, pesanan: { nomor: order.nomor, status: "ditolak", alasan } };
}

/**
 * The one row change a Tolak makes. `tx` because the staff path puts its Entri
 * Audit in the same transaction, and the `diajukan` in the WHERE because two
 * answers at once must leave one Ditolak and one refusal, not two declines.
 * The offer on the table goes with the order: a declined order has nothing left
 * to accept.
 */
async function tulisTolak(tx: Database, pesananId: string, alasan: AlasanTolak, now: Date): Promise<boolean> {
  const moved = await tx
    .update(pemesananMakam)
    .set({
      status: "ditolak",
      ditolakPada: now,
      alasanTolak: alasan,
      alternatifJenisMakamId: null,
      alternatifPemakamanAt: null,
      alternatifDitawarkanPada: null,
    })
    .where(and(eq(pemesananMakam.id, pesananId), eq(pemesananMakam.status, "diajukan")))
    .returning({ id: pemesananMakam.id });
  return moved.length > 0;
}

/**
 * What a Tolak tells the family, whoever made it: the reason in the list's own
 * wording with the link back to Pilih makam, and the Tier 1 call row for Admin
 * Platform. The row is opened whether or not the email went anywhere, so an
 * order with no email still gets its call (ADR 0004: for such an order the call
 * is the only channel).
 */
async function umumkanTolak(deps: PemesananDeps, order: OrderSaatDuka, alasan: AlasanTolak): Promise<void> {
  // The city the list the family is sent back to is filtered by is the declining
  // Lokasi's own city: a family in a city with no other Lokasi Mitra would rather
  // see the whole list than an empty one.
  const lokasi = await deps.lokasi.publicLokasiMitra(order.lokasiId);
  await deps.notifikasi.pesananDitolak({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    alasan: ALASAN_TOLAK[alasan],
    kota: lokasi?.city ?? null,
    almarhum: { name: order.almarhumName, tanggalWafat: order.tanggalWafat },
    pemesan: { name: order.pemesanName, phoneNumber: order.phoneNumber },
  });
}
