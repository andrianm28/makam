/**
 * Placing a Saat Duka TPU order (spec, Pengurusan > order kinds; stories 68–72;
 * the second way into the Saat Duka wizard): the Operator secures the burial with
 * a DKI TPU and files the IPTM afterwards. The submission creates the order in
 * status Diajukan with its Nomor Pemesanan and the deadline the fixed TPU window
 * promised (two service hours on 06:00–18:00 WIB), attaches the two document
 * sets, and bills nothing: the Tagihan is issued at the confirmation (ticket 45).
 *
 * What it refuses, in order: an empty Pemesan or Almarhum name, a Pemegang Hak
 * who is the Almarhum, an email that is not the Akun's own (the Kode Masuk proved
 * it one line earlier), a TPU that is not on the list or is not taking new plots,
 * an ineligible family (neither a DKI KTP nor a death in Jakarta), a Tumpang
 * without the grave described and its IPTM photographed, and a price that cannot
 * be quoted now. What it does not check is availability: the TPU itself assigns
 * the plot, and Admin Platform confirms the burial with it (ticket 45).
 */
import { randomUUID } from "node:crypto";
import type { ItemHariHTpu } from "@/domain/layanan/tpu-skema";
import { refusable } from "@/db/unit-of-work";
import { withinPaymentCap } from "@/domain/billing";
import { normaliseEmail, normalisePhoneNumber } from "@/domain/identity";
import { daytimeHoursDeadline } from "@/domain/lokasi";
import { documentExtension } from "@/lib/files/document-type";
import { foldKey } from "@/lib/fold-key";
import { daftarDokumen } from "./dokumen";
import { JAM_KONFIRMASI_TPU } from "./pilihan";
import { pengurusanTpu } from "./schema";
import type { Pemesan, PengurusanDeps } from "./deps";
import { FOTO_IPTM_MAX_BYTES } from "./skema-pengurusan";
import type { JenisPenguburan, Kelayakan, KuburanTpu, PemegangHak, PemegangHakInput } from "./skema-pengurusan";

/** An IPTM photo as a screen hands it over: the bytes and the type the browser declared. */
export interface FotoIptm {
  body: Uint8Array;
  contentType: string;
}

/** What the wizard's TPU form collects about the Almarhum and the grave. */
export interface PlaceSaatDukaTpuInput {
  /** The Akun placing the order and the Email Terverifikasi it was proven to. */
  pemesan: Pemesan;
  /** The Pemesan's name as typed on the submission screen. */
  pemesanName: string;
  /** The Pemesan's contact number as typed; kept unverified, never a login. */
  phoneNumber: string;
  tpuId: string;
  almarhumName: string;
  /** The date of death, a WIB calendar date (`YYYY-MM-DD`). */
  tanggalWafat: string;
  /** How the grave is made: a new plot, or on top of one that already holds a grave. */
  jenis: JenisPenguburan;
  /** The two eligibility answers; both "no" is refused, and a death outside Jakarta adds documents. */
  kelayakan: Kelayakan;
  /** The grave a Tumpang is made in; required for a Tumpang, ignored for a Baru. */
  kuburan?: KuburanTpu | null;
  /** The IPTM of that grave; required for a Tumpang, ignored for a Baru. */
  fotoIptm?: FotoIptm | null;
  /** The Pemegang Hak for the IPTM: the Pemesan, or a relative named on the form. */
  pemegangHak: PemegangHakInput;
  /**
   * Hari-H Layanan for the burial day (story 23): only the variant and the text it asks
   * for. They are priced onto the Tagihan at the confirmation, when the burial day is agreed.
   */
  layananHariH?: ItemHariHTpu[];
}

export type PlaceSaatDukaTpuResult =
  | { ok: true; pengurusan: { nomor: string; status: "diajukan"; konfirmasiDueAt: Date } }
  /** The email is not that Akun's Email Terverifikasi: the Kode Masuk and the order must agree. */
  | { ok: false; reason: "email_bukan_akun_ini" }
  /** No TPU carries that id. */
  | { ok: false; reason: "tpu_tidak_ada" }
  /** The TPU is not taking new plots, so it is not on the list and takes no new order. */
  | { ok: false; reason: "tpu_tidak_menerima_makam_baru" }
  /** Neither a DKI KTP nor a death in Jakarta: a TPU cannot take this order, a Lokasi Mitra can. */
  | { ok: false; reason: "kelayakan_tidak_terpenuhi" }
  /** A Tumpang that does not say which grave it is made in. */
  | { ok: false; reason: "kuburan_kosong" }
  /** A Tumpang without the IPTM photo of that grave. */
  | { ok: false; reason: "foto_iptm_kosong" }
  /** The IPTM photo is past the size a photo of one permit page may be. */
  | { ok: false; reason: "foto_iptm_terlalu_besar" }
  /** The IPTM photo is not a photo or scan we can read. */
  | { ok: false; reason: "berkas_tidak_didukung" }
  /** The private FileStore refused to keep the IPTM photo. */
  | { ok: false; reason: "berkas_gagal_disimpan" }
  /** The TPU price cannot be quoted now, or its total is above the QRIS cap. */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** The Pemesan's name is missing. */
  | { ok: false; reason: "pemesan_kosong" }
  /** The Almarhum's name is missing. */
  | { ok: false; reason: "almarhum_kosong" }
  /** The named Pemegang Hak is the Almarhum, who can never hold the right. */
  | { ok: false; reason: "pemegang_hak_almarhum" }
  /** A hari-H Layanan this TPU does not offer (not marked "boleh di TPU DKI", not "bisa hari-H", or with no DKI price). */
  | { ok: false; reason: "layanan_tidak_tersedia" }
  /** A hari-H Layanan that asks for a text, left empty. */
  | { ok: false; reason: "teks_kosong" };

/** The kinds of file an IPTM photo may be: a phone photo or a scan of the permit. */
const FOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/**
 * Places one Saat Duka TPU order: Diajukan, with the Nomor Pemesanan the family
 * reads it by, the confirmation deadline the TPU window promised, both document
 * sets attached, and no Tagihan at all.
 */
export async function placeSaatDukaTpu(deps: PengurusanDeps, input: PlaceSaatDukaTpuInput): Promise<PlaceSaatDukaTpuResult> {
  const now = deps.clock.now();
  const pemesanName = input.pemesanName.trim();
  if (pemesanName === "") return { ok: false, reason: "pemesan_kosong" };
  const almarhumName = input.almarhumName.trim();
  if (almarhumName === "") return { ok: false, reason: "almarhum_kosong" };

  const pemegangHak = pemegangHakOf(input, pemesanName, almarhumName);
  if (!pemegangHak.ok) return pemegangHak;

  const akun = await deps.identity.accountByEmail(input.pemesan.email);
  if (!akun || akun.id !== input.pemesan.accountId) return { ok: false, reason: "email_bukan_akun_ini" };

  const tpu = await deps.lokasi.publicTpuDki(input.tpuId);
  if (!tpu) return { ok: false, reason: "tpu_tidak_ada" };
  // A TPU that is not taking new plots holds no plot to give, so the wizard never
  // listed it and it takes no new order: the flag is checked again here because
  // it can have been turned off between the card and the submission.
  if (!tpu.newPlot) return { ok: false, reason: "tpu_tidak_menerima_makam_baru" };

  // "KTP DKI?" and "Meninggal di Jakarta?": a family with neither cannot be buried
  // at a DKI TPU through us, and a Lokasi Mitra is open to them.
  if (!input.kelayakan.ktpDki && !input.kelayakan.wafatDiJakarta) return { ok: false, reason: "kelayakan_tidak_terpenuhi" };

  const kuburan = input.kuburan ?? null;
  const fotoIptm = input.fotoIptm ?? null;
  if (input.jenis === "tumpang") {
    if (!kuburan || kuburan.blokNomor.trim() === "" || kuburan.nama.trim() === "") return { ok: false, reason: "kuburan_kosong" };
    if (!fotoIptm) return { ok: false, reason: "foto_iptm_kosong" };
  }

  const quoted = await deps.tariffs.quote(
    [
      { kind: "biaya_pengurusan", pengurusan: "pemakaman" },
      { kind: "retribusi_pemda", retribusi: "iptm" },
    ],
    now,
  );
  if (!quoted.ok || !withinPaymentCap(quoted.total)) return { ok: false, reason: "harga_tidak_tersedia" };

  // The hari-H items, checked against what a TPU offers today so the family is refused now rather than at the
  // confirmation. Their price is not stored: the Tagihan is priced on the day it is issued.
  const hariH = (input.layananHariH ?? []).map((satu) => ({ layananVariantId: satu.layananVariantId, teks: satu.teks?.trim() || null }));
  if (hariH.length > 0) {
    if (!deps.layanan) return { ok: false, reason: "layanan_tidak_tersedia" };
    const dihitung = await deps.layanan.barisHariHTpu(hariH, now);
    if (!dihitung.ok) return { ok: false, reason: dihitung.reason === "teks_kosong" ? "teks_kosong" : "layanan_tidak_tersedia" };
    if (!withinPaymentCap(quoted.total + dihitung.total)) return { ok: false, reason: "harga_tidak_tersedia" };
  }

  // The photo goes in before the row that points at it, and comes out again if the
  // order cannot be written: a key nothing references is a dead file.
  let fotoIptmKey: string | null = null;
  if (fotoIptm) {
    if (fotoIptm.body.byteLength > FOTO_IPTM_MAX_BYTES) return { ok: false, reason: "foto_iptm_terlalu_besar" };
    const extension = documentExtension(fotoIptm, FOTO_TYPES);
    if (!extension) return { ok: false, reason: "berkas_tidak_didukung" };
    const key = `pengurusan/foto-iptm/${randomUUID()}.${extension}`;
    try {
      await deps.files.put({ key, body: fotoIptm.body, contentType: fotoIptm.contentType });
    } catch {
      return { ok: false, reason: "berkas_gagal_disimpan" };
    }
    fotoIptmKey = key;
  }

  const dokumen = daftarDokumen({ jenis: input.jenis, kelayakan: input.kelayakan });
  const konfirmasiDueAt = batasTpu(now);
  const phoneNumber = phoneOf(input.phoneNumber);
  const placed = await refusable(deps.db, async (tx) => {
    // The Nomor Pemesanan is taken inside this transaction, so a rolled-back order gives its number back.
    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    const [row] = await tx
      .insert(pengurusanTpu)
      .values({
        nomor,
        kind: "saat_duka_tpu",
        status: "diajukan",
        tpuId: tpu.id,
        tpuName: tpu.name,
        tpuAddress: tpu.address,
        pemesanAccountId: akun.id,
        pemesanName,
        email: akun.email,
        phoneNumber,
        almarhumName,
        tanggalWafat: input.tanggalWafat,
        jenisPenguburan: input.jenis,
        kelayakan: input.kelayakan,
        kuburan: input.jenis === "tumpang" ? kuburan : null,
        fotoIptmKey,
        pemegangHak: pemegangHak.value,
        dokumenPemakaman: dokumen.pemakaman,
        dokumenPengajuan: dokumen.pengajuan,
        layananHariH: hariH.length > 0 ? hariH : null,
        konfirmasiDueAt,
        diajukanAt: now,
      })
      .returning({ nomor: pengurusanTpu.nomor });
    return { ok: true as const, pengurusan: { nomor: row.nomor, status: "diajukan" as const, konfirmasiDueAt } };
  });
  if (!placed.ok) {
    if (fotoIptmKey) await deps.files.delete(fotoIptmKey).catch(() => undefined);
    return placed;
  }
  return placed;
}

/** Two service hours on the fixed TPU window (06:00–18:00 WIB), counted by Lokasi's calculator, never here. */
function batasTpu(now: Date): Date {
  // The TPU window is fixed and never closed, so the calculator always answers.
  return daytimeHoursDeadline(now, JAM_KONFIRMASI_TPU);
}

/**
 * The Pemegang Hak to record for the IPTM: the Pemesan themselves (their typed
 * name, their contact number and the email the Kode Masuk proved), or the
 * relative they named with their own. Either way the holder is not the Almarhum.
 */
function pemegangHakOf(
  input: PlaceSaatDukaTpuInput,
  pemesanName: string,
  almarhumName: string,
): { ok: true; value: PemegangHak } | { ok: false; reason: "pemegang_hak_almarhum" } {
  if (input.pemegangHak.mode === "pemesan") {
    if (foldKey(pemesanName) === foldKey(almarhumName)) return { ok: false, reason: "pemegang_hak_almarhum" };
    return { ok: true, value: { mode: "pemesan", name: pemesanName, phoneNumber: phoneOf(input.phoneNumber), email: null } };
  }
  const name = input.pemegangHak.name.trim();
  if (name === "" || foldKey(name) === foldKey(almarhumName)) return { ok: false, reason: "pemegang_hak_almarhum" };
  return {
    ok: true,
    value: {
      mode: "lain",
      name,
      phoneNumber: phoneOf(input.pemegangHak.phoneNumber),
      email: normaliseEmail(input.pemegangHak.email) || null,
    },
  };
}

/** A contact number in canonical form; one that is not an Indonesian number is kept as typed, never as a login. */
function phoneOf(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  const normalised = normalisePhoneNumber(trimmed);
  return normalised.ok ? normalised.phoneNumber : trimmed;
}
