/**
 * Chasing overdue pay-after Tagihan (spec, Billing > Chasing; ticket 29's AC
 * 1, 2, 4, 6). Billing owns the Tagihan and its `lewat_jatuh_tempo_at` anchor
 * (ticket 25's `setOverdueAnchor`), so the reads here and the Tidak Tertagih
 * transition live beside it; the reminder schedule, the call log and the
 * Admin Lokasi push are Notifications' (ticket 29's chasing.ts there), reached
 * through the same public-function seam as everywhere else.
 *
 * `hasLoggedCall` is a dependency rather than an import of Notifications: this
 * module is already the one Notifications depends on for a Tagihan's status
 * (`Pick<Billing, "tagihan">`), so the reverse import would be a cycle. The
 * composition root wires it to Notifications' own `teleponPemesanTercatat`
 * once both are built (`src/server/runtime.ts`); left unwired, Tidak Tertagih
 * can never be declared, which is the safe default (never a false positive).
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { Rupiah } from "@/lib/rupiah";
import { DAY_MS } from "@/lib/time/jakarta";
import { tagihan, tagihanLine } from "./schema";
import type { TagihanStatus } from "./tagihan";

/** How long a pay-after Tagihan is chased before Admin Platform may give up on it (spec, Billing > Chasing). */
export const TIDAK_TERTAGIH_HARI = 30;

/** One pay-after Tagihan whose overdue clock is running: what the overdue list, the Tier 3 row and the Chasing reminders are about. */
export interface PayAfterAnchored {
  id: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  placeName: string | null;
  /** The Lokasi Mitra it is against, read off its tariff line: null for a TPU order (Admin Platform's own money, no Admin Lokasi to push). */
  lokasiId: string | null;
  addressee: { name: string; phoneNumber: string; accountId: string | null };
  total: Rupiah;
  status: TagihanStatus;
  lewatJatuhTempoAt: Date;
  link: string;
}

const chasingSelection = {
  id: tagihan.id,
  nomor: tagihan.nomor,
  nomorPemesanan: tagihan.nomorPemesanan,
  placeName: tagihan.placeName,
  addresseeName: tagihan.addresseeName,
  addresseePhone: tagihan.addresseePhone,
  addresseeAccountId: tagihan.addresseeAccountId,
  total: tagihan.total,
  status: tagihan.status,
  lewatJatuhTempoAt: tagihan.lewatJatuhTempoAt,
  link: tagihan.link,
};

/** The Lokasi Mitra each Tagihan's tariff line names, for all of them in one query (a TPU order has none). */
async function lokasiIdsOf(db: Database, tagihanIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (tagihanIds.length === 0) return found;
  const lines = await db
    .select({ tagihanId: tagihanLine.tagihanId, provider: tagihanLine.provider })
    .from(tagihanLine)
    .where(and(inArray(tagihanLine.tagihanId, tagihanIds), inArray(tagihanLine.kind, ["harga_hak_pakai", "biaya_pemakaman"])));
  for (const line of lines) {
    const provider = line.provider as { kind: string; lokasiId?: string };
    if (provider.kind === "lokasi_mitra" && provider.lokasiId && !found.has(line.tagihanId)) found.set(line.tagihanId, provider.lokasiId);
  }
  return found;
}

type ChasingRow = {
  id: string;
  nomor: string;
  nomorPemesanan: string | null;
  placeName: string | null;
  addresseeName: string;
  addresseePhone: string;
  addresseeAccountId: string | null;
  total: Rupiah;
  status: TagihanStatus;
  lewatJatuhTempoAt: Date | null;
  link: string;
};

async function toAnchoredAll(db: Database, rows: ChasingRow[]): Promise<PayAfterAnchored[]> {
  const lokasi = await lokasiIdsOf(db, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    nomorTagihan: row.nomor,
    nomorPemesanan: row.nomorPemesanan,
    placeName: row.placeName,
    lokasiId: lokasi.get(row.id) ?? null,
    addressee: { name: row.addresseeName, phoneNumber: row.addresseePhone, accountId: row.addresseeAccountId },
    total: row.total,
    status: row.status,
    lewatJatuhTempoAt: row.lewatJatuhTempoAt as Date,
    link: row.link,
  }));
}

/**
 * Every pay-after Tagihan whose overdue anchor is known, oldest anchor first,
 * whatever its current status: what Notifications' Chasing schedules its four
 * reminders from (`setOverdueAnchor` sets the anchor once and never moves it,
 * so scheduling from this list is itself idempotent — the unique
 * Tagihan-per-template index is the actual guard).
 */
export async function listPayAfterAnchored(db: Database): Promise<PayAfterAnchored[]> {
  const rows = await db
    .select(chasingSelection)
    .from(tagihan)
    .where(isNotNull(tagihan.lewatJatuhTempoAt))
    .orderBy(asc(tagihan.lewatJatuhTempoAt), asc(tagihan.nomor));
  return toAnchoredAll(db, rows);
}

/**
 * Every Tagihan currently being chased (Lewat Jatuh Tempo) or given up on
 * (Tidak Tertagih), oldest anchor first: the overdue list (Admin Platform's
 * and, filtered to one Lokasi, Admin Lokasi's read-only one), the Tier 3
 * Antrean row and the H+1 escalation tick all read this one query.
 */
export async function listTagihanLewatJatuhTempo(db: Database): Promise<PayAfterAnchored[]> {
  const rows = await db
    .select(chasingSelection)
    .from(tagihan)
    .where(inArray(tagihan.status, ["lewat_jatuh_tempo", "tidak_tertagih"]))
    .orderBy(asc(tagihan.lewatJatuhTempoAt), asc(tagihan.nomor));
  return toAnchoredAll(db, rows);
}

export type DeclareTidakTertagihResult =
  | { ok: true; tagihan: PayAfterAnchored }
  | { ok: false; reason: "tidak_ditemukan" }
  /** Not currently Lewat Jatuh Tempo (never overdue, already Lunas/Dibatalkan, or a pay-first Tagihan). */
  | { ok: false; reason: "tagihan_tidak_lewat_jatuh_tempo" }
  /** Before H+30 of the overdue anchor: spec, "Tidak Tertagih declared by hand from H+30". */
  | { ok: false; reason: "belum_h30" }
  /** No call has been logged for it yet: spec, "…after at least one call". */
  | { ok: false; reason: "belum_ada_panggilan" };

/**
 * Admin Platform gives up chasing a Tagihan: Tidak Tertagih, guarded on both
 * of the spec's conditions (H+30 of the overdue anchor, at least one logged
 * call) so neither can be skipped by calling this directly. Idempotent: a
 * Tagihan already Tidak Tertagih is returned as it stands. The Tagihan stays
 * payable afterwards (untouched here: nothing in `recordPayment` / `bayar`
 * excludes this status).
 */
export async function declareTidakTertagih(
  deps: { db: Database; hasLoggedCall: (tagihanId: string) => Promise<boolean> },
  tagihanId: string,
  now: Date,
): Promise<DeclareTidakTertagihResult> {
  if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
  return refusable<DeclareTidakTertagihResult>(deps.db, async (tx) => {
    const [row] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" };
    if (row.status === "tidak_tertagih") return { ok: true, tagihan: (await toAnchoredAll(tx, [row]))[0]! };
    if (row.status !== "lewat_jatuh_tempo" || !row.lewatJatuhTempoAt) {
      return { ok: false, reason: "tagihan_tidak_lewat_jatuh_tempo" };
    }
    const h30 = new Date(row.lewatJatuhTempoAt.getTime() + TIDAK_TERTAGIH_HARI * DAY_MS);
    if (now < h30) return { ok: false, reason: "belum_h30" };
    if (!(await deps.hasLoggedCall(tagihanId))) return { ok: false, reason: "belum_ada_panggilan" };
    const [moved] = await tx
      .update(tagihan)
      .set({ status: "tidak_tertagih" })
      .where(and(eq(tagihan.id, row.id), eq(tagihan.status, "lewat_jatuh_tempo")))
      .returning({ id: tagihan.id });
    if (!moved) return { ok: false, reason: "tagihan_tidak_lewat_jatuh_tempo" };
    return { ok: true, tagihan: (await toAnchoredAll(tx, [{ ...row, status: "tidak_tertagih" }]))[0]! };
  });
}
