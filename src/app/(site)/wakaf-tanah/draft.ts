/**
 * What the Wakaf Tanah form holds while it is filled in: plain text, as typed. The Server Action turns it
 * into the module's input and the module's own schema decides whether it is valid. Types only; nothing
 * from a domain barrel reaches this file (it is on a client component's import graph).
 */
export interface DraftWakaf {
  tujuan: "sosial" | "keluarga";
  namaKeluarga: string;
  wakifNama: string;
  wakifTelepon: string;
  hubunganDenganTanah: string;
  kabKota: string;
  alamat: string;
  lat: string;
  lng: string;
  luasM2: string;
  jenisBukti: string;
  /** A Nazhir from the list, or empty. */
  nazhirId: string;
  /** A Nazhir the Wakif already has, typed; ignored when `nazhirId` is set. */
  nazhirNama: string;
}

export type KirimWakafState =
  | { status: "idle" }
  | { status: "perlu_kode_masuk" }
  | { status: "selesai"; nomor: string }
  /** Outside Jabodetabek: nothing is handled here, and the pointer says where to go. */
  | { status: "dirujuk"; nomor: string; petunjuk: string }
  | { status: "gagal"; message: string };

export const initialKirimWakafState: KirimWakafState = { status: "idle" };
