/**
 * What the Permintaan Kedukaan form holds while it is filled in: plain text, as typed. The Server Action
 * turns it into the Kedukaan module's input and the module's own schema decides whether it is valid.
 * Types only; nothing from a domain barrel reaches this file (it is on a client component's import graph).
 */
import type { JenisKedukaan } from "@/domain/kedukaan/skema";

export interface DraftKedukaan {
  jenis: JenisKedukaan;
  nama: string;
  telepon: string;
  kabKota: string;
  catatan: string;
  /** Pickup city or place (Mobil Jenazah, Cargo). */
  asal: string;
  /** Destination (Mobil Jenazah, Cargo, Repatriasi). */
  tujuan: string;
  /** Country the body comes from (Repatriasi). */
  negaraAsal: string;
  /** The date needed, `YYYY-MM-DD` (all but Konsultasi). */
  tanggal: string;
  /** Bunga Duka Cita. */
  teksUcapan: string;
  /** Konsultasi: pagi / siang / sore. */
  waktuDihubungi: string;
  /** Konsultasi: a Lokasi Makam of interest. */
  lokasiDiminati: string;
}

export type KirimKedukaanState =
  | { status: "idle" }
  | { status: "perlu_kode_masuk" }
  | { status: "selesai"; nomor: string }
  | { status: "gagal"; message: string };

export function draftKosong(jenis: JenisKedukaan): DraftKedukaan {
  return { jenis, nama: "", telepon: "", kabKota: "", catatan: "", asal: "", tujuan: "", negaraAsal: "", tanggal: "", teksUcapan: "", waktuDihubungi: "pagi", lokasiDiminati: "" };
}
