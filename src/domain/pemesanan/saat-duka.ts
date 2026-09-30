/**
 * Placing a Pemesanan Saat Duka at a Lokasi Mitra (spec, Pemesanan > Saat
 * Duka): the wizard's Kirim. It creates the order in status Diajukan with its
 * Nomor Pemesanan and the confirmation deadline its Jam Operasional promised,
 * and bills nothing: the Tagihan is issued when the Lokasi confirms.
 */
import { refusable } from "@/db/unit-of-work";
import { normaliseEmail, normalisePhoneNumber } from "@/domain/identity";
import { foldKey } from "@/lib/fold-key";
import { wib } from "@/lib/time/jakarta";
import { pemesananMakam, type PemegangHak } from "./schema";
import { JAM_KONFIRMASI_SAAT_DUKA, saatDukaHarga } from "./pilihan";
import type { Pemesan, PemesananDeps } from "./deps";

/** The Pemegang Hak as the screen offers it: the Pemesan, or someone else named on the order. */
export type PemegangHakInput =
  | { mode: "pemesan" }
  | { mode: "lain"; name: string; phoneNumber: string; email: string };

export interface PlaceSaatDukaInput {
  /** The Akun placing the order and the Email Terverifikasi it was proven to. */
  pemesan: Pemesan;
  /** The Pemesan's name as typed on "Data & kirim". */
  pemesanName: string;
  /** The Pemesan's contact number as typed; kept unverified, never a login. */
  phoneNumber: string;
  lokasiId: string;
  jenisMakamId: string;
  almarhumName: string;
  /** The date of death, a WIB calendar date (`YYYY-MM-DD`). */
  tanggalWafat: string;
  /**
   * The burial the family plans, as "Data & kirim" holds it: the `datetime-local`
   * value read as WIB (`YYYY-MM-DDTHH:mm`), empty when the family has no plan.
   */
  rencanaPemakamanAt: string;
  /** A placement wish as typed; empty when the family has none. */
  keinginanPenempatan: string;
  pemegangHak: PemegangHakInput;
}

export type PlaceSaatDukaResult =
  | { ok: true; pemesanan: { id: string; nomor: string; status: "diajukan"; konfirmasiDueAt: Date | null } }
  /** The email is not that Akun's Email Terverifikasi: the Kode Masuk and the order must agree. */
  | { ok: false; reason: "email_bukan_akun_ini" }
  /** The Lokasi Mitra is not listed (Terverifikasi), so it takes no new order. */
  | { ok: false; reason: "lokasi_tidak_terbuka" }
  /** The Jenis Makam cannot be priced at that Lokasi Mitra now, or its all-in total is above the QRIS cap. */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** The Pemesan's name is missing. */
  | { ok: false; reason: "pemesan_kosong" }
  /** The Almarhum's name is missing. */
  | { ok: false; reason: "almarhum_kosong" }
  /** The named Pemegang Hak is the Almarhum, who can never hold the right. */
  | { ok: false; reason: "pemegang_hak_almarhum" };

/**
 * Places one Pemesanan Saat Duka: Diajukan, with the Nomor Pemesanan the
 * family reads it by, the confirmation deadline its Lokasi's Jam Operasional
 * promised (2 service hours), and no Tagihan at all.
 *
 * What it checks, in order: that the email really is that Akun's (the Kode
 * Masuk proved it one line earlier), that the Lokasi Mitra still takes orders
 * and the chosen Jenis Makam can still be priced within the QRIS cap, and that
 * the Pemegang Hak is not the Almarhum. What it does not check is
 * availability: a Saat Duka order holds no plot — the Admin Lokasi assigns a
 * cleared Tersedia Petak when it confirms, and offers another or declines.
 */
export async function placeSaatDuka(deps: PemesananDeps, input: PlaceSaatDukaInput): Promise<PlaceSaatDukaResult> {
  const now = deps.clock.now();
  const pemesanName = input.pemesanName.trim();
  if (pemesanName === "") return { ok: false, reason: "pemesan_kosong" };
  const almarhumName = input.almarhumName.trim();
  if (almarhumName === "") return { ok: false, reason: "almarhum_kosong" };

  const pemegangHak = pemegangHakOf(input, pemesanName, almarhumName);
  if (!pemegangHak.ok) return pemegangHak;

  const akun = await deps.identity.accountByEmail(input.pemesan.email);
  if (!akun || akun.id !== input.pemesan.accountId) return { ok: false, reason: "email_bukan_akun_ini" };

  const lokasi = await deps.lokasi.publicLokasiMitra(input.lokasiId);
  if (!lokasi) return { ok: false, reason: "lokasi_tidak_terbuka" };
  const pricing = await deps.tariffs.lokasiPricing(input.lokasiId, now);
  const kartu = pricing.jenisMakam.find((card) => card.jenisMakam.id === input.jenisMakamId);
  const harga = await saatDukaHarga(deps, input.lokasiId, input.jenisMakamId, now);
  if (!kartu || !harga) return { ok: false, reason: "harga_tidak_tersedia" };

  const batas = await deps.lokasi.serviceHoursDeadline(input.lokasiId, JAM_KONFIRMASI_SAAT_DUKA, now);
  const konfirmasiDueAt = batas.ok ? batas.at : null;
  const rencana = rencanaPemakamanAt(input.rencanaPemakamanAt);
  const phoneNumber = phoneOf(input.phoneNumber);
  const placed = await refusable(deps.db, async (tx) => {
    // The Nomor Pemesanan is taken inside this transaction, so a rolled-back order gives its number back.
    const nomor = await deps.billing.within(tx).nextNomorPemesanan();
    const [row] = await tx
      .insert(pemesananMakam)
      .values({
        nomor,
        kind: "saat_duka",
        status: "diajukan",
        lokasiId: lokasi.id,
        lokasiName: lokasi.name,
        jenisMakamId: kartu.jenisMakam.id,
        jenisMakamName: kartu.jenisMakam.name,
        pemesanAccountId: akun.id,
        pemesanName,
        email: akun.email,
        phoneNumber,
        almarhumName,
        tanggalWafat: input.tanggalWafat,
        rencanaPemakamanAt: rencana,
        keinginanPenempatan: teksAtauKosong(input.keinginanPenempatan),
        pemegangHak: pemegangHak.value,
        konfirmasiDueAt,
        diajukanAt: now,
      })
      .returning({ id: pemesananMakam.id, nomor: pemesananMakam.nomor });
    return { ok: true as const, pemesanan: { id: row.id, nomor: row.nomor, status: "diajukan" as const, konfirmasiDueAt } };
  });
  if (!placed.ok) return placed;

  await deps.notifikasi.pesananDiajukan({
    id: placed.pemesanan.id,
    nomor: placed.pemesanan.nomor,
    lokasi: { id: lokasi.id, name: lokasi.name },
    jenisMakamName: kartu.jenisMakam.name,
    almarhum: { name: almarhumName, tanggalWafat: input.tanggalWafat },
    pemesan: { name: pemesanName, phoneNumber, email: akun.email },
    rencanaPemakamanAt: rencana,
    konfirmasiDueAt,
    penerima: await penerimaOf(deps, lokasi.id),
  });
  return placed;
}

/**
 * Every Akun Staf that must see a new order at that Lokasi Mitra: its Admin
 * Lokasi, and its Kontak Siaga when that is one of them (it always is, while it
 * is still Admin Lokasi here). Once each: a Lokasi Mitra's staff never hears
 * the same order twice.
 */
export async function penerimaOf(deps: PemesananDeps, lokasiId: string): Promise<{ accountId: string }[]> {
  const [adminLokasi, kontakSiaga] = await Promise.all([deps.identity.adminLokasiOf(lokasiId), deps.lokasi.kontakSiagaOf(lokasiId)]);
  const ids = new Set(adminLokasi.map((akun) => akun.accountId));
  if (kontakSiaga) ids.add(kontakSiaga.accountId);
  return [...ids].map((accountId) => ({ accountId }));
}

/**
 * The Pemegang Hak to record: the Pemesan themselves (their typed name, their
 * contact number and the proven email), or the relative they named with their
 * own. Either way the holder may not be the Almarhum.
 */
function pemegangHakOf(
  input: PlaceSaatDukaInput,
  pemesanName: string,
  almarhumName: string,
): { ok: true; value: PemegangHak } | { ok: false; reason: "pemegang_hak_almarhum" } {
  if (input.pemegangHak.mode === "pemesan") {
    if (foldKey(pemesanName) === foldKey(almarhumName)) return { ok: false, reason: "pemegang_hak_almarhum" };
    return { ok: true, value: { mode: "pemesan", name: pemesanName, phoneNumber: phoneOf(input.phoneNumber), email: input.pemesan.email } };
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

/**
 * The planned burial as the `datetime-local` input holds it, read as WIB
 * (AGENTS.md: all wall-clock reasoning is Asia/Jakarta, `@/lib/time/jakarta`);
 * null when the family left it empty.
 */
function rencanaPemakamanAt(typed: string): Date | null {
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  return wib(trimmed);
}

/** A free-text field as typed, or null when the field was left empty. */
function teksAtauKosong(typed: string): string | null {
  const trimmed = typed.trim();
  return trimmed === "" ? null : trimmed;
}

/** A contact number in canonical form; one that is not an Indonesian number is kept as typed, never as a login. */
function phoneOf(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  const normalised = normalisePhoneNumber(trimmed);
  return normalised.ok ? normalised.phoneNumber : trimmed;
}
