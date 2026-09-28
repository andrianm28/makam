/**
 * The Pencairan run (spec, Billing > Payouts: "one row per recipient with due
 * items minus Potongan. Items can be held out with a reason"; ticket 32's AC 5)
 * and the hold-out that takes an item out of it.
 *
 * A run is a **read**, never a write: it is what Admin Platform sees when the
 * Antrean row says a transfer is due, and money only moves when
 * `terbitkanBuktiPencairan` (in `./transfer.ts`) is called for the items it
 * lists. Nothing here can pay anybody, so a run looked at twice, or by two Admin
 * Platforms at once, changes nothing.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { pencairanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { BankAccount, Lokasi } from "@/domain/lokasi";
import type { Clock } from "@/ports/clock";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import {
  itemsBelumJatuhTempo,
  itemsDue,
  jumlahOf,
  potonganBerjalan,
  recipientOf,
  toBarisItem,
  type BarisItemPencairan,
  type BarisPencairan,
  type ItemRow,
} from "./baca";
import { pencairanItem } from "./schema";

/** The most a hold-out reason may say. */
const ALASAN_HOLD_MAX = 500;

export interface JalankanDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The Lokasi Mitra's record, which is where an Admin Platform's read finds the bank account to pay. */
  lokasi: Pick<Lokasi, "lokasiMitra">;
}

/**
 * Every recipient with money waiting: one row each, its due items less the
 * Potongan it carries, its earliest deadline, and the account to pay (Admin
 * Platform only; anyone else gets no rows at all).
 */
export async function jalankanPencairan(deps: JalankanDeps, by: Actor): Promise<BarisPencairan[]> {
  if (writeRefusal(by, "pencairan.lihat_semua", pencairanResource())) return [];

  const rows = new Map<string, BarisPencairan>();
  const rowFor = async (item: ItemRow): Promise<BarisPencairan> => {
    const recipient = recipientOf(item);
    const key = recipient.kind === "lokasi_mitra" ? `lokasi_mitra:${recipient.lokasiId}` : `mitra_jasa:${recipient.akunId}`;
    const ada = rows.get(key);
    if (ada) return ada;
    const row: BarisPencairan = {
      recipient,
      items: [],
      itemsBelumJatuhTempo: [],
      ditahan: [],
      potongan: [],
      jumlahItem: 0 as Rupiah,
      potonganDipotong: 0 as Rupiah,
      neto: null,
      jatuhTempoAt: item.jatuhTempoAt ?? new Date(Number.MAX_SAFE_INTEGER),
      rekening: await rekeningOf(deps, by, recipient),
    };
    rows.set(key, row);
    return row;
  };

  for (const item of await itemsDue(deps.db)) {
    const row = await rowFor(item);
    if (item.jatuhTempoAt) row.jatuhTempoAt = new Date(Math.min(row.jatuhTempoAt.getTime(), item.jatuhTempoAt.getTime()));
    if (item.tahanAlasan !== null) {
      row.ditahan.push({ id: item.id, label: item.label, amount: jumlahOf(item), alasan: item.tahanAlasan });
      continue;
    }
    row.items.push(toBarisItem(item));
  }
  for (const item of await itemsBelumJatuhTempo(deps.db)) {
    (await rowFor(item)).itemsBelumJatuhTempo.push({ nomorPemesanan: item.nomorPemesanan });
  }

  for (const row of rows.values()) {
    // A Mitra Jasa never carries a Potongan: the spec allows none, so a
    // recipient that is not a Lokasi Mitra has nothing to read them from.
    row.potongan = row.recipient.kind === "lokasi_mitra" ? await potonganBerjalan(deps.db, row.recipient.lokasiId) : [];
    const jumlah = sumRupiah(row.items.map((item) => item.amount));
    if (jumlah.ok) row.jumlahItem = jumlah.amount;
    row.potonganDipotong = potongSisa(row);
    // Nothing to transfer is not a transfer of Rp 0, and a net below Rp 0 is
    // never transferred either: the row says so and the Potongan that did not
    // fit carries forward to the next run (AC 4).
    row.neto = row.jumlahItem > row.potonganDipotong ? (row.jumlahItem - row.potonganDipotong) as Rupiah : null;
  }
  return [...rows.values()]
    .filter((row) => row.items.length > 0 || row.potongan.length > 0)
    .sort((a, b) => a.jatuhTempoAt.getTime() - b.jatuhTempoAt.getTime());
}

/**
 * How much of a row's Potongan a transfer of that row takes: the oldest lines
 * first, and never more than the items come to. The rest stays `berjalan` and
 * is offered again next time, which is what carrying forward means (AC 4).
 */
function potongSisa(row: BarisPencairan): Rupiah {
  let sisa = row.jumlahItem;
  let dipotong = 0;
  for (const entry of row.potongan) {
    if (sisa <= 0) break;
    const dari = Math.min(entry.amount, sisa) as Rupiah;
    dipotong += dari;
    entry.dipotong = dari;
    sisa = (sisa - dari) as Rupiah;
  }
  return dipotong as Rupiah;
}

/** The bank account a transfer goes to: only an Admin Platform's read of the Lokasi's record carries it. */
async function rekeningOf(deps: JalankanDeps, by: Actor, recipient: BarisPencairan["recipient"]): Promise<BankAccount | null> {
  if (recipient.kind !== "lokasi_mitra") return null;
  const lokasi = await deps.lokasi.lokasiMitra(by, recipient.lokasiId);
  return lokasi.ok ? (lokasi.lokasiMitra.bankAccount ?? null) : null;
}

export type TahanPencairanResult =
  | { ok: true; item: BarisItemPencairan | null; ditahan: boolean }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** The item is `dicairkan` or `dibatalkan`: its money is settled, so it is never held again. */
  | { ok: false; reason: "sudah_selesai" }
  /** A hold needs a reason, and it was empty or longer than ${ALASAN_HOLD_MAX} characters. */
  | { ok: false; reason: "alasan_tidak_valid" };

/**
 * Admin Platform holds an item out of the next runs with a reason, or puts a
 * held one back (`alasan: null`). Audited, because it is a decision about
 * somebody's money.
 *
 * A hold is a flag and not a status, deliberately: releasing it must never make
 * the item transferable a second time, which the one-way status to `dicairkan`
 * is there to guarantee.
 */
export async function tahanPencairan(
  deps: JalankanDeps,
  by: Actor,
  input: { itemId: string; alasan: string | null },
): Promise<TahanPencairanResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(input.itemId).success) return { ok: false, reason: "tidak_ditemukan" };
  const alasan = input.alasan === null ? null : z.string().trim().min(1).max(ALASAN_HOLD_MAX).safeParse(input.alasan);
  if (alasan && !alasan.success) return { ok: false, reason: "alasan_tidak_valid" };
  const ditahan = alasan?.data ?? null;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // The row lock is what makes a hold and a transfer of the same item
    // impossible at once: one of the two waits for the other.
    const [row] = await tx.select().from(pencairanItem).where(eq(pencairanItem.id, input.itemId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status === "dicairkan" || row.status === "dibatalkan") return { ok: false, reason: "sudah_selesai" } as const;
    await tx
      .update(pencairanItem)
      .set(
        ditahan === null
          ? { tahanAlasan: null, tahanPada: null, tahanOleh: null }
          : { tahanAlasan: ditahan, tahanPada: now, tahanOleh: by.accountId },
      )
      .where(eq(pencairanItem.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pencairan.tahan",
      entity: { kind: "pencairan_item", id: row.id },
      lokasiId: row.lokasiId,
      before: { ditahan: row.tahanAlasan !== null, alasan: row.tahanAlasan },
      after: { ditahan: ditahan !== null, alasan: ditahan },
      reason: ditahan,
    });
    const [setelah] = await tx.select().from(pencairanItem).where(eq(pencairanItem.id, row.id));
    return { ok: true, item: setelah ? toBarisItem(setelah) : null, ditahan: ditahan !== null } as const;
  });
}
