/**
 * Offering a family another TPU (spec, Pemesanan > Saat Duka: "Tawarkan
 * alternatif (another Jenis Makam / day, accept or decline by the Pemesan)";
 * the TPU form of it, ticket 45). A TPU is not the Operator's to promise: a plot
 * runs out, or the TPU's office is full that week, and the burial has to happen
 * somewhere else.
 *
 * So an offer is a row of its own, never an edit of the order: the order stays
 * Diajukan with its own TPU until the family answers, and the Tier 1
 * "Konfirmasi TPU Saat Duka" row stays open, because the burial is still
 * unarranged. Accepting moves the order onto the offered TPU, re-prices it (the
 * price is the same at every TPU, so only the documents can change), and gives
 * it a fresh two-service-hour deadline. Declining is a Tolak: the order is
 * Ditolak, exactly as declining an alternative at a Lokasi Mitra is (ticket 24
 * builds that track), and the family is pointed at the other TPUs.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { daytimeHoursDeadline } from "@/domain/lokasi";
import type { PengurusanDeps } from "./deps";
import { pengurusanTpu } from "./schema";
import { daftarDokumen } from "./dokumen";
import { JAM_KONFIRMASI_TPU } from "./pilihan";

/** What Admin Platform's offer form sends: the order, and the TPU to offer. */
export const tawarkanTpuLainSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The TPU the family is offered instead; it must be one the list still offers. */
  tpuId: z.string().trim().min(1).max(100),
  /** Why this one is offered, in one line the family reads. */
  alasan: z.string().trim().min(1, "Tulis alasan TPU lain ini ditawarkan.").max(300),
});
export type TawarkanTpuLainInput = z.infer<typeof tawarkanTpuLainSchema>;

export type TawarkanTpuLainResult =
  | { ok: true; tpu: { id: string; name: string; address: string }; alasan: string }
  | { ok: false; reason: "input_tidak_valid" }
  /** No Diajukan Saat Duka TPU order of that Nomor Pemesanan. */
  | { ok: false; reason: "pengurusan_tidak_ditemukan" }
  /** The offered TPU is not on the list, or has stopped taking new plots. */
  | { ok: false; reason: "tpu_tidak_ada" | "tpu_tidak_menerima_makam_baru" }
  /** It is the TPU the order already names, so nothing is being offered. */
  | { ok: false; reason: "tpu_sama" }
  /** A staff write this actor may not do. */
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

/** What the Pemesan's accept or decline sends. */
export const jawabTpuLainSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  diterima: z.boolean(),
});
export type JawabTpuLainInput = z.infer<typeof jawabTpuLainSchema>;

export type JawabTpuLainResult =
  | { ok: true; status: "diajukan" | "ditolak"; tpu: { id: string; name: string } }
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan, or it is not this Akun's. */
  | { ok: false; reason: "pengurusan_tidak_ditemukan" }
  /** Nothing has been offered, or the order has moved on: there is nothing to answer. */
  | { ok: false; reason: "tidak_ada_tawaran" }
  /** The order lacks the burial data a Saat Duka TPU order carries, so its document set cannot be made. */
  | { ok: false; reason: "status_tidak_sesuai" };

/**
 * Records the TPU Admin Platform offers instead, on an order that has not
 * confirmed. The order itself does not move: it keeps the TPU the family applied
 * to, and the offer is what waits for their answer, so a family that never
 * replies is still chasing the TPU it asked for rather than one it was offered.
 */
export async function tawarkanTpuLain(
  deps: PengurusanDeps,
  by: { accountId: string },
  rawInput: unknown,
): Promise<TawarkanTpuLainResult> {
  const parsed = tawarkanTpuLainSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const [order] = await deps.db.select().from(pengurusanTpu).where(eq(pengurusanTpu.nomor, input.nomor));
  return tawarkan(deps, order, input);
}

async function tawarkan(
  deps: PengurusanDeps,
  order: typeof pengurusanTpu.$inferSelect | undefined,
  input: TawarkanTpuLainInput,
): Promise<TawarkanTpuLainResult> {
  if (!order || order.kind !== "saat_duka_tpu" || order.status !== "diajukan") {
    return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  }
  const tpu = await deps.lokasi.publicTpuDki(input.tpuId);
  if (!tpu) return { ok: false, reason: "tpu_tidak_ada" };
  if (!tpu.newPlot) return { ok: false, reason: "tpu_tidak_menerima_makam_baru" };
  if (tpu.id === order.tpuId) return { ok: false, reason: "tpu_sama" };

  const now = deps.clock.now();
  await deps.db
    .update(pengurusanTpu)
    .set({
      tpuDitawarkanId: tpu.id,
      tpuDitawarkanName: tpu.name,
      tpuDitawarkanAddress: tpu.address,
      alasanTpuDitawarkan: input.alasan,
      tpuDitawarkanPada: now,
    })
    .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "diajukan")));
  return { ok: true, tpu: { id: tpu.id, name: tpu.name, address: tpu.address }, alasan: input.alasan };
}

/**
 * The family's answer to the offer: accept moves the order onto the offered TPU
 * and starts the confirmation clock again, decline makes it Ditolak with the
 * reason, exactly as declining a Lokasi Mitra's alternative is (ticket 24).
 *
 * Accepting re-derives the document set from the same two answers the family
 * gave at submission, so a screen and the order can never disagree about what
 * the family was told to bring.
 */
export async function jawabTpuLain(
  deps: Pick<PengurusanDeps, "db" | "clock" | "lokasi">,
  pemesan: { accountId: string },
  rawInput: unknown,
): Promise<JawabTpuLainResult> {
  const parsed = jawabTpuLainSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const [order] = await deps.db
    .select()
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.nomor, input.nomor), eq(pengurusanTpu.pemesanAccountId, pemesan.accountId)));
  if (!order || order.kind !== "saat_duka_tpu") return { ok: false, reason: "pengurusan_tidak_ditemukan" };
  if (order.status !== "diajukan" || !order.tpuDitawarkanId) return { ok: false, reason: "tidak_ada_tawaran" };

  const now = deps.clock.now();
  if (!input.diterima) {
    await deps.db
      .update(pengurusanTpu)
      .set({ status: "ditolak", alasan: "TPU lain ditolak oleh keluarga" })
      .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "diajukan")));
    return { ok: true, status: "ditolak", tpu: { id: order.tpuId, name: order.tpuName } };
  }

  // Accepting: the TPU can only be one the list still offers, since the offer
  // was made from the list and a flag can have been turned off since.
  const tpu = await deps.lokasi.publicTpuDki(order.tpuDitawarkanId);
  if (!tpu || !tpu.newPlot) return { ok: false, reason: "tidak_ada_tawaran" };

  if (order.jenisPenguburan === null || order.kelayakan === null) return { ok: false, reason: "status_tidak_sesuai" };
  const dokumen = daftarDokumen({ jenis: order.jenisPenguburan, kelayakan: order.kelayakan });
  await deps.db
    .update(pengurusanTpu)
    .set({
      tpuId: tpu.id,
      tpuName: tpu.name,
      tpuAddress: tpu.address,
      dokumenPemakaman: dokumen.pemakaman,
      dokumenPengajuan: dokumen.pengajuan,
      // A new TPU is a new promise, so the clock starts again from now.
      konfirmasiDueAt: daytimeHoursDeadline(now, JAM_KONFIRMASI_TPU),
      tpuDitawarkanId: null,
      tpuDitawarkanName: null,
      tpuDitawarkanAddress: null,
      alasanTpuDitawarkan: null,
      tpuDitawarkanPada: null,
    })
    .where(and(eq(pengurusanTpu.id, order.id), eq(pengurusanTpu.status, "diajukan")));
  return { ok: true, status: "diajukan", tpu: { id: tpu.id, name: tpu.name } };
}

/** The offer as the family's order page shows it, or null when none is open. */
export function tawaranOf(order: {
  status: string;
  tpuDitawarkanId: string | null;
  tpuDitawarkanName: string | null;
  tpuDitawarkanAddress: string | null;
  alasanTpuDitawarkan: string | null;
}): TawaranTpu | null {
  if (order.status !== "diajukan") return null;
  if (!order.tpuDitawarkanId || !order.tpuDitawarkanName) return null;
  return {
    tpu: { id: order.tpuDitawarkanId, name: order.tpuDitawarkanName, address: order.tpuDitawarkanAddress ?? "" },
    alasan: order.alasanTpuDitawarkan ?? "",
  };
}

/** One TPU offered instead of the one the order names. */
export interface TawaranTpu {
  tpu: { id: string; name: string; address: string };
  /** Why Admin Platform offered it, in the family's own words. */
  alasan: string;
}
