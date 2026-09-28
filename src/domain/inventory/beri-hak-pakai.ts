/**
 * Assigning a Petak Makam to a confirmed Pemesanan Makam (spec, Pemesanan >
 * Saat Duka: "Confirm = assign a cleared Tersedia Petak of the chosen Jenis
 * Makam → Hak Pakai Aktif"; ticket 23). The Petak, the Hak Pakai and its
 * Pemegang Hak are the Inventory module's own, so this is its public seam: the
 * Pemesanan module asks for one cleared Tersedia unit of a Jenis Makam and
 * hands over the holder it recorded.
 *
 * `tenure` is read from the Petak's own Jenis Makam here (never taken from the
 * caller), and the tenure clock stays unstarted: it starts at the first
 * Pemakaman, which the Admin Lokasi records (ticket 25).
 */
import { and, eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { forStatus, hakPakaiByTarget, memegangPetak } from "./hak-pakai-reads";
import { grantHakPakai, type NewPemegangHak } from "./hak-pakai-grant";
import { lockBlok } from "./locks";
import { inventoryBlok, inventoryPetak } from "./schema";
import { derivePetakStatus } from "./status";
import { tenureOfJenisMakam } from "./tenure";

/** One cleared Tersedia unit of a Jenis Makam, as the confirm form's list shows it. */
export interface TersediaUnit {
  petakId: string;
  /** Its Nomor Makam, as the Lokasi and the family know it. */
  nomor: string;
  blok: string;
}

export type BeriHakPakaiResult =
  | { ok: true; hakPakaiId: string; /** The Petak's Nomor Makam, as the order keeps it. */
    nomor: string }
  | WriteRefusal
  /** No Petak Makam of that id at that Lokasi Mitra. */
  | { ok: false; reason: "petak_tidak_ditemukan" }
  /** The Petak is of another Jenis Makam than the one the order chose. */
  | { ok: false; reason: "jenis_makam_beda" }
  /** The Petak is not a cleared Tersedia unit (still Perlu Verifikasi, Tidak Tersedia, or already held). */
  | { ok: false; reason: "petak_belum_tersedia" }
  /** No Pemegang Hak given; an order's holder is never empty. */
  | { ok: false; reason: "pemegang_hak_kosong" };

/**
 * Every cleared Tersedia Petak Makam of one Jenis Makam at a Lokasi Mitra, by
 * Nomor Makam: what a confirm offers the Admin Lokasi, and never a Petak of
 * another Jenis Makam, one still Perlu Verifikasi, or one already held. No
 * actor: the Petak inventory is a fact the confirm and the wizard both read.
 */
export async function tersediaUntukJenisMakam(
  deps: Pick<InventoryDeps, "db">,
  lokasiId: string,
  jenisMakamId: string,
): Promise<TersediaUnit[]> {
  const [petakRows, blokRows, { byPetak }] = await Promise.all([
    deps.db.select().from(inventoryPetak).where(and(eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.kind, "petak"))),
    deps.db.select({ id: inventoryBlok.id, name: inventoryBlok.name }).from(inventoryBlok).where(eq(inventoryBlok.lokasiId, lokasiId)),
    hakPakaiByTarget(deps.db, lokasiId),
  ]);
  const namaBlok = new Map(blokRows.map((blok) => [blok.id, blok.name]));
  return petakRows
    .filter((petak) => !petak.kavlingId && !petak.perluVerifikasi && petak.jenisMakamId === jenisMakamId)
    .filter(
      (petak) =>
        derivePetakStatus({ tidakTersediaReason: petak.tidakTersediaReason, hakPakai: forStatus(byPetak.get(petak.id) ?? null) }) ===
        "tersedia",
    )
    .map((petak) => ({ petakId: petak.id, nomor: petak.nomorMakam ?? "", blok: namaBlok.get(petak.blokId) ?? "" }))
    .sort((a, b) => a.nomor.localeCompare(b.nomor, "id"));
}

/**
 * Gives one cleared Tersedia Petak Makam to a Pemegang Hak: the Hak Pakai
 * Aktif an order's confirmation creates, audited on the Lokasi. Refused when
 * the Petak is not a cleared Tersedia unit of the chosen Jenis Makam, so two
 * Admin Lokasi confirming the same order at once cannot both take it.
 */
export async function beriHakPakai(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  input: { petakId: string; jenisMakamId: string; pemegangHak: NewPemegangHak },
): Promise<BeriHakPakaiResult> {
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (input.pemegangHak.name.trim() === "") return { ok: false, reason: "pemegang_hak_kosong" };

  const [petak] = await deps.db
    .select()
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.id, input.petakId), eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.kind, "petak")));
  if (!petak) return { ok: false, reason: "petak_tidak_ditemukan" };
  if (petak.kavlingId || petak.jenisMakamId !== input.jenisMakamId) return { ok: false, reason: "jenis_makam_beda" };
  if (petak.perluVerifikasi) return { ok: false, reason: "petak_belum_tersedia" };
  // A right that was given back holds nothing, so that Petak is free again (see `memegangPetak`).
  if (await memegangPetak(deps.db, petak.id)) return { ok: false, reason: "petak_belum_tersedia" };
  if (petak.tidakTersediaReason) return { ok: false, reason: "petak_belum_tersedia" };

  const tenure = await tenureOfJenisMakam(deps, by, lokasiId, input.jenisMakamId);
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, petak.blokId);
    // Re-read inside the lock: a second confirm may have taken it meanwhile.
    const [terkunci] = await tx
      .select()
      .from(inventoryPetak)
      .where(and(eq(inventoryPetak.id, petak.id), eq(inventoryPetak.lokasiId, lokasiId)));
    if (!terkunci || terkunci.tidakTersediaReason || (await memegangPetak(tx, petak.id))) {
      return { ok: false as const, reason: "petak_belum_tersedia" as const };
    }
    const hakPakaiId = await grantHakPakai(tx, now, by, {
      lokasiId,
      petakId: petak.id,
      kavlingId: null,
      tenure,
      dataMenyusul: false,
      pemegangHak: input.pemegangHak,
      pemakaman: null,
    });
    await tx.update(inventoryPetak).set({ firstUsedAt: now }).where(eq(inventoryPetak.id, petak.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.pakai_petak",
      entity: { kind: "hak_pakai", id: hakPakaiId },
      lokasiId,
      before: { petakId: petak.id, nomor: petak.nomorMakam, status: "tersedia" },
      after: { petakId: petak.id, nomor: petak.nomorMakam, status: "terisi", pemegangHak: input.pemegangHak.name },
      reason: null,
    });
    return { ok: true as const, hakPakaiId, nomor: petak.nomorMakam ?? "" };
  });
}
