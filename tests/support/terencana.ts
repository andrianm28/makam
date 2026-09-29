import { eq } from "drizzle-orm";
import { inventoryHakPakai } from "@/domain/inventory/schema";
import type { Actor } from "@/domain/identity";
import { DEFAULT_FLAGS, DEFAULT_POLICIES, type LokasiFlags, type LokasiPolicies } from "@/domain/lokasi";
import { catatCekDenah } from "./fieldwork";
import { jenisMakamInput, publishedLokasiMitra, type PublishSetup } from "./publish";

/**
 * A Terverifikasi Lokasi Mitra with "Pemesanan Terencana aktif" on and a Denah
 * that holds every state the picker has to show: cleared Tersedia Petak, a Terisi
 * one, a Tidak Tersedia one, a whole Kavling Keluarga, a Jalan, a Bukan Petak and
 * a newly drawn Blok whose Petak still need the Admin Lokasi's clearing. Ticket
 * 36's starting point for the wizard's picker, its hold and its order.
 */

export interface TerencanaOptions {
  name?: string;
  /** The Jenis Makam's Harga Hak Pakai; 2.500.000 by default, so several Petak fit under the Rp 10.000.000 QRIS cap. */
  hargaHakPakai?: number;
  /** Whether this Lokasi Mitra allows tumpang, and tumpang on a released Petak (`tumpangOnReleasedPlots`); on by default. */
  tumpang?: boolean;
  /** Whether to switch "Pemesanan Terencana aktif" on; false leaves the Lokasi Mitra listed but not taking Terencana orders. */
  terencana?: boolean;
  /** The Masa Pembatalan in days this Lokasi Mitra starts with. */
  masaPembatalanDays?: number;
  /** The refund after the Masa Pembatalan, in percent. */
  refundPercent?: number;
}

export interface DenahSel {
  id: string;
  row: number;
  col: number;
}

export interface TerencanaLokasi {
  admin: Actor;
  adminLokasi: Actor;
  lokasiMitra: { id: string; name: string; city: string };
  jenisMakam: { id: string; name: string };
  blok: { id: string; name: string };
  /** Blok A's cells by their Nomor Makam. */
  sel: Map<string, DenahSel>;
}

/**
 * A published Lokasi Mitra with its policy set, one Blok cleared cell by cell and
 * "Pemesanan Terencana aktif" switched on through the real gate (every Petak
 * cleared, a Cek Denah recorded). Blok B is drawn afterwards, so it is the
 * Petak that still needs clearing.
 */
export async function terencanaLokasi(setup: PublishSetup, admin: Actor, options: TerencanaOptions = {}): Promise<TerencanaLokasi> {
  const jenisMakamLain = jenisMakamInput("Reguler 2 × 1 m");
  const published = await publishedLokasiMitra(setup, admin, options.name, {
    jenisMakam: { ...jenisMakamLain, tariff: { ...jenisMakamLain.tariff, hargaHakPakai: options.hargaHakPakai ?? 2_500_000 } },
  });
  const { lokasiMitra, adminLokasi, jenisMakam } = published;

  const flags: LokasiFlags = {
    ...DEFAULT_FLAGS,
    tumpang: { allowed: options.tumpang ?? true, minYears: 3, maxLayers: 2 },
    tumpangOnReleasedPlots: options.tumpang ?? true,
  };
  const policies: LokasiPolicies = {
    ...DEFAULT_POLICIES,
    masaPembatalanDays: options.masaPembatalanDays ?? DEFAULT_POLICIES.masaPembatalanDays,
    refundAfterMasaPembatalanPercent: options.refundPercent ?? DEFAULT_POLICIES.refundAfterMasaPembatalanPercent,
  };
  const configured = await setup.lokasi.setPoliciesAndFlags(admin, lokasiMitra.id, { policies, flags });
  if (!configured.ok) throw new Error(`kebijakan refused: ${configured.reason}`);

  const blok = await setup.inventory.createBlok(adminLokasi, lokasiMitra.id, {
    name: "A",
    rows: 2,
    cols: 6,
    jenisMakamId: jenisMakam.id,
  });
  if (!blok.ok) throw new Error(`Blok refused: ${blok.reason}`);

  const fixture: TerencanaLokasi = { admin, adminLokasi, lokasiMitra, jenisMakam, blok: blok.blok, sel: new Map() };
  await isiBlokA(setup, fixture);

  await catatCekDenah(setup, admin, published.petugas, lokasiMitra.id);
  if (options.terencana ?? true) {
    const perluVerifikasi = await setup.inventory.hasPetakPerluVerifikasi(lokasiMitra.id);
    const switched = await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: perluVerifikasi });
    if (!switched.ok) throw new Error(`Terencana refused: ${switched.reason}`);
  }

  // Drawn after the switch, so its Petak are the ones that still need clearing.
  await setup.inventory.createBlok(adminLokasi, lokasiMitra.id, { name: "B", rows: 2, cols: 2, jenisMakamId: jenisMakam.id });
  return fixture;
}

/**
 * Blok A (2 rows × 6 cols, so A-01…A-06 are the first row) in the states the
 * picker distinguishes: A-01, A-02, A-07 and A-08 pickable, A-03 and A-09 Terisi
 * under a live Hak Pakai (one layer, room for a second), A-04 Tidak Tersedia, A-05
 * and A-11 one Kavling Keluarga cleared Tersedia (the fifth column), A-10 Terisi
 * under a Hak Pakai that has ended, A-06 a Jalan, A-12 Bukan Petak.
 */
export async function isiBlokA(setup: PublishSetup, fixture: TerencanaLokasi): Promise<void> {
  const { adminLokasi, lokasiMitra, jenisMakam, blok } = fixture;
  fixture.sel = await petakByNomor(setup, adminLokasi, lokasiMitra.id, blok.id);

  await setKind(setup, adminLokasi, lokasiMitra.id, blok.id, fixture.sel, ["A-06"], "jalan");
  await setKind(setup, adminLokasi, lokasiMitra.id, blok.id, fixture.sel, ["A-12"], "bukan_petak");
  await bersihkan(setup, adminLokasi, lokasiMitra.id, "A-04", fixture.sel, { mode: "tidak_tersedia", reason: "Dirawat pengelola" });
  for (const nomor of ["A-01", "A-02", "A-07", "A-08"]) await bersihkan(setup, adminLokasi, lokasiMitra.id, nomor, fixture.sel, { mode: "tersedia" });
  for (const nomor of ["A-03", "A-09", "A-10"]) {
    await bersihkan(setup, adminLokasi, lokasiMitra.id, nomor, fixture.sel, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Ahmad Fauzi", phoneNumber: "081298765432", email: "ahmad.fauzi@contoh.id" },
      pemakaman: { almarhumName: "Siti Aminah", date: "2026-06-14", layer: 1 },
    });
  }
  const kavling = await setup.inventory.createKavling(adminLokasi, lokasiMitra.id, blok.id, {
    cellIds: ["A-05", "A-11"].map((nomor) => selAt(fixture.sel, nomor).id),
    jenisMakamId: jenisMakam.id,
  });
  if (!kavling.ok) throw new Error(`Kavling refused: ${kavling.reason}`);
  const cleared = await setup.inventory.clearKavling(adminLokasi, lokasiMitra.id, kavling.kavlingId, { mode: "tersedia" });
  if (!cleared.ok) throw new Error(`Kavling refused: ${cleared.reason}`);
}

/** Ends a Petak's Hak Pakai (Berakhir, not yet cleared), which is the released-plot case the picker shows as tumpang-only. */
export async function releasedPetak(setup: PublishSetup, nomor: string, sel: Map<string, DenahSel>): Promise<void> {
  const petakId = selAt(sel, nomor).id;
  const [hakPakai] = await setup.db.select({ id: inventoryHakPakai.id }).from(inventoryHakPakai).where(eq(inventoryHakPakai.petakId, petakId));
  if (!hakPakai) throw new Error(`${nomor} has no Hak Pakai`);
  // No public function ends a Hak Pakai yet (expiry and a manual ending are ticket
  // 42), so the released state is written straight onto its row here.
  await setup.db
    .update(inventoryHakPakai)
    .set({ status: "berakhir", endReason: "berakhir" })
    .where(eq(inventoryHakPakai.id, hakPakai.id));
}

/** Blok A's cells by their Nomor Makam, read the way the Admin Lokasi reads its own Denah. */
async function petakByNomor(setup: PublishSetup, by: Actor, lokasiId: string, blokId: string) {
  const denah = await setup.inventory.asStaff(by).blok(lokasiId, blokId);
  if (!denah) throw new Error("Blok not found");
  return new Map(
    denah.cells
      .filter((cell) => cell.kind === "petak" && cell.nomorMakam !== null)
      .map((cell) => [cell.nomorMakam as string, { id: cell.id, row: cell.row, col: cell.col }]),
  );
}

function selAt(sel: Map<string, DenahSel>, nomor: string): DenahSel {
  const cell = sel.get(nomor);
  if (!cell) throw new Error(`no Petak ${nomor}`);
  return cell;
}

async function setKind(
  setup: PublishSetup,
  by: Actor,
  lokasiId: string,
  blokId: string,
  sel: Map<string, DenahSel>,
  nomor: string[],
  kind: "petak" | "jalan" | "bukan_petak",
) {
  const changed = await setup.inventory.setCellKind(by, lokasiId, blokId, { cellIds: nomor.map((one) => selAt(sel, one).id), kind });
  if (!changed.ok) throw new Error(`setCellKind refused: ${changed.reason}`);
}

async function bersihkan(
  setup: PublishSetup,
  by: Actor,
  lokasiId: string,
  nomor: string,
  sel: Map<string, DenahSel>,
  input: Parameters<PublishSetup["inventory"]["clearPetak"]>[3],
) {
  const cleared = await setup.inventory.clearPetak(by, lokasiId, selAt(sel, nomor).id, input);
  if (!cleared.ok) throw new Error(`clearPetak ${nomor} refused: ${cleared.reason}`);
}
