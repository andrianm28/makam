/**
 * A Mitra Jasa's own Pencairan as a list (spec, Billing > Payouts: "the Mitra Jasa version shows only job, Layanan,
 * date and rate"; stories 181 and 182; ticket 55 AC 3): what their page shows, newest first.
 *
 * **What one entry is.** A Pencairan is the Operator paying for one job (CONTEXT.md), and a Bukti Pencairan is one
 * bank transfer listing every Pencairan it covers. The Mitra Jasa is paid by transfer, so the entry that matters to
 * them is the transfer: **a transfer already made is one entry holding every job it covered**, for the amount that
 * reached their bank, and each Pencairan not yet transferred is its own entry, because each has its own status and
 * its own date. Nothing else is a grouping: the Operator's run is per recipient, a Mitra Jasa has one recipient, and
 * the amounts here are the ones the run and the Bukti Pencairan use (`jumlahOf`, the Bukti's own lines).
 *
 * **What a Mitra Jasa never reads.** The projection is explicit: status, a date, the jobs (Layanan, TPU, date, rate),
 * a total and the Bukti. There is no Potongan (a Mitra Jasa never carries one), no order number, no family, no Lokasi
 * Mitra and no Hak Pakai, because none of them is on the Mitra Jasa's item to begin with; and the two staff-only facts
 * about an item, why Admin Platform held it and why it was cancelled, are reduced to their status.
 *
 * A Ditangguhkan or Berhenti Mitra Jasa reads it too (story 182): the authorization is the role, never the status.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { authorize, type Actor } from "@/domain/identity";
import type { Rupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import { jumlahOf, type ItemRow } from "./baca";
import { buktiPencairan, buktiPencairanItem, pencairanItem } from "./schema";

/**
 * Where one Pencairan stands for the Mitra Jasa: waiting for the Keluhan window to close, due (Admin Platform has to
 * transfer it), due but held out by Admin Platform (the reason stays with staff), transferred, or cancelled.
 */
export type StatusPencairanMitraJasa = "belum_jatuh_tempo" | "jatuh_tempo" | "ditahan" | "dicairkan" | "dibatalkan";

/** One job a Pencairan pays for, as its Mitra Jasa reads it: the Layanan, the TPU, the date and the rate. */
export interface PekerjaanPencairanMitraJasa {
  itemId: string;
  layanan: string;
  /** The TPU it was done at; null for an item recorded before the TPU was kept. */
  tpu: string | null;
  /** The target date (WIB "YYYY-MM-DD"). */
  tanggal: string | null;
  /** What this job pays, whole rupiah: the rate, or the rate Admin Platform lowered it to after a Keluhan. */
  tarif: Rupiah;
}

export interface PencairanMitraJasaEntri {
  /** Stable across reads: the Bukti Pencairan's number once transferred, otherwise the item's id. */
  kunci: string;
  status: StatusPencairanMitraJasa;
  /**
   * Dicairkan: the date of the transfer. Jatuh tempo: the date Admin Platform is to have transferred it by (2 Hari
   * Kerja after it fell due). Dibatalkan: the date it was cancelled. Otherwise null (a Pencairan still waiting for its
   * window has no date yet, and a held one has none to promise).
   * WIB "YYYY-MM-DD".
   */
  tanggal: string | null;
  /** Newest first; one job unless it is a transfer that covered several. */
  pekerjaan: PekerjaanPencairanMitraJasa[];
  /** What this Pencairan pays, paid or will pay, whole rupiah: the transfer's amount for a Dicairkan one, and Rp 0 for a Dibatalkan one. */
  total: Rupiah;
  /** The Bukti Pencairan of the transfer (its page is at `/dokumen/<link>`), once there is one. */
  bukti: { nomorBukti: string; link: string } | null;
}

export type DaftarPencairanMitraJasa = { ok: true; pencairan: PencairanMitraJasaEntri[] } | { ok: false; reason: "tidak_berwenang" };

interface Entri {
  /** When this record was made, which is all "newest first" means: a Pencairan when its job was approved, a transfer when its Bukti was issued. */
  dibuatPada: Date;
  entri: PencairanMitraJasaEntri;
}

/**
 * The signed-in Mitra Jasa's Pencairan, newest first. Only their own: the query is keyed by their Akun and nothing
 * else is ever asked, so another Mitra Jasa's item, a Lokasi Mitra's and a Potongan are not in the rows to begin with.
 */
export async function daftarPencairanMitraJasa(db: Database, by: Actor): Promise<DaftarPencairanMitraJasa> {
  if (!authorize(by, "pencairan.punya_saya", { kind: "akun", accountId: by.accountId }).allowed) {
    return { ok: false, reason: "tidak_berwenang" };
  }
  const items = await db
    .select()
    .from(pencairanItem)
    .where(and(eq(pencairanItem.penerimaKind, "mitra_jasa"), eq(pencairanItem.penerimaAkunId, by.accountId)));
  const transfer = await db
    .select({
      buktiId: buktiPencairan.id,
      nomor: buktiPencairan.nomor,
      link: buktiPencairan.link,
      ditransferPada: buktiPencairan.ditransferPada,
      amount: buktiPencairan.amount,
      dibuatPada: buktiPencairan.dibuatPada,
      itemId: buktiPencairanItem.itemId,
      tarif: buktiPencairanItem.amount,
    })
    .from(buktiPencairan)
    .innerJoin(buktiPencairanItem, eq(buktiPencairanItem.buktiId, buktiPencairan.id))
    .where(and(eq(buktiPencairan.penerimaKind, "mitra_jasa"), eq(buktiPencairan.penerimaAkunId, by.accountId)));

  const itemById = new Map(items.map((item) => [item.id, item]));
  const daftar: Entri[] = [];

  // A transfer already made: one entry, with the jobs it covered at the amounts the Bukti Pencairan lists.
  const perBukti = new Map<string, typeof transfer>();
  for (const baris of transfer) perBukti.set(baris.buktiId, [...(perBukti.get(baris.buktiId) ?? []), baris]);
  const sudahDitransfer = new Set<string>();
  for (const baris of perBukti.values()) {
    const [pertama] = baris;
    const pekerjaan = baris
      .flatMap((satu) => {
        const item = itemById.get(satu.itemId);
        return item ? [{ item, tarif: satu.tarif }] : [];
      })
      .sort((a, b) => urutan(a.item, b.item))
      .map(({ item, tarif }) => pekerjaanOf(item, tarif));
    for (const satu of baris) sudahDitransfer.add(satu.itemId);
    daftar.push({
      dibuatPada: pertama.dibuatPada,
      entri: {
        kunci: pertama.nomor,
        status: "dicairkan",
        tanggal: pertama.ditransferPada,
        pekerjaan,
        total: pertama.amount,
        bukti: { nomorBukti: pertama.nomor, link: pertama.link },
      },
    });
  }

  // Every other Pencairan stands alone.
  for (const item of items) {
    if (sudahDitransfer.has(item.id)) continue;
    const status = statusOf(item);
    daftar.push({
      dibuatPada: item.dibuatPada,
      entri: {
        kunci: item.id,
        status,
        tanggal: tanggalOf(item, status),
        pekerjaan: [pekerjaanOf(item, jumlahOf(item))],
        total: status === "dibatalkan" ? (0 as Rupiah) : jumlahOf(item),
        bukti: null,
      },
    });
  }

  return {
    ok: true,
    pencairan: daftar.sort((a, b) => b.dibuatPada.getTime() - a.dibuatPada.getTime() || a.entri.kunci.localeCompare(b.entri.kunci)).map(({ entri }) => entri),
  };
}

/** Newest job first, then by id, so two jobs recorded at one instant keep one order. */
function urutan(a: ItemRow, b: ItemRow): number {
  return b.dibuatPada.getTime() - a.dibuatPada.getTime() || a.id.localeCompare(b.id);
}

function pekerjaanOf(item: ItemRow, tarif: Rupiah): PekerjaanPencairanMitraJasa {
  return {
    itemId: item.id,
    layanan: item.layananNama ?? item.pekerjaanLabel ?? item.label,
    tpu: item.tpuNama,
    tanggal: item.tanggalLayanan,
    tarif,
  };
}

/** A hold only matters once the item is due: before that there is nothing to hold back from a transfer. */
function statusOf(item: ItemRow): StatusPencairanMitraJasa {
  switch (item.status) {
    case "dibatalkan":
      return "dibatalkan";
    case "dicairkan":
      return "dicairkan";
    case "jatuh_tempo":
      return item.tahanAlasan === null ? "jatuh_tempo" : "ditahan";
    default:
      return "belum_jatuh_tempo";
  }
}

function tanggalOf(item: ItemRow, status: StatusPencairanMitraJasa): string | null {
  const instant = status === "jatuh_tempo" ? item.jatuhTempoAt : status === "dibatalkan" ? item.batalPada : status === "dicairkan" ? item.dicairkanPada : null;
  return instant ? wibDateOf(instant) : null;
}
