import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/*
 * Pacing of the runner's requests for an emailed Kode Masuk.
 *
 * The server counts every request per IP: at least 60 s apart and at most five in
 * any rolling hour (src/domain/identity/otp.ts: OTP_RESEND_AFTER_MS,
 * OTP_SEND_WINDOW_MS, OTP_MAX_SENDS_PER_WINDOW). A refused request costs the owner
 * a wait and a code read out for nothing, so the runner keeps inside both limits
 * before it presses "Kirim Kode Masuk" or "Kirim ulang kode". The history lives in
 * a file, so a second run (or a second process) keeps the same gap.
 */

export const JEDA_ANTAR_KODE_MS = 60_000;
export const BATAS_KODE_PER_JAM = 5;
export const JENDELA_KODE_MS = 3_600_000;
/** Added on top of the server's limits, for a runner clock that runs a little apart from the server's. */
export const MARGIN_BAWAAN_MS = 3_000;
/** The longest the runner waits by itself before it refuses and says when to try again. */
export const MAKS_TUNGGU_BAWAAN_MS = 10 * 60_000;

export type KeputusanKirimKode =
  | { jenis: "boleh" }
  | { jenis: "tunggu"; ms: number }
  | { jenis: "tolak"; bolehLagi: Date };

/**
 * What to do about one more request at `sekarang` (epoch ms), given the earlier
 * requests: go ahead, wait `ms`, or refuse because the wait would pass
 * `maksTungguMs` (the hour is full), with the time it opens again.
 */
export function putuskanKirimKode(
  riwayat: readonly number[],
  sekarang: number,
  opsi: { margin?: number; maksTungguMs?: number } = {},
): KeputusanKirimKode {
  const margin = opsi.margin ?? MARGIN_BAWAAN_MS;
  const maksTungguMs = opsi.maksTungguMs ?? MAKS_TUNGGU_BAWAAN_MS;
  const terbaruDulu = riwayat.filter((waktu) => waktu > sekarang - JENDELA_KODE_MS).sort((a, b) => b - a);

  let tungguMs = 0;
  if (terbaruDulu.length > 0) tungguMs = Math.max(tungguMs, terbaruDulu[0] + JEDA_ANTAR_KODE_MS + margin - sekarang);
  if (terbaruDulu.length >= BATAS_KODE_PER_JAM) {
    // The hour reopens when the oldest request that keeps it full drops out of it.
    const penahan = terbaruDulu[BATAS_KODE_PER_JAM - 1];
    tungguMs = Math.max(tungguMs, penahan + JENDELA_KODE_MS + margin - sekarang);
  }
  if (tungguMs <= 0) return { jenis: "boleh" };
  if (tungguMs > maksTungguMs) return { jenis: "tolak", bolehLagi: new Date(sekarang + tungguMs) };
  return { jenis: "tunggu", ms: tungguMs };
}

/** The runner may not ask for another Kode Masuk now, and would have to wait longer than it was allowed to. */
export class BatasKodeTercapai extends Error {
  constructor(readonly bolehLagi: Date) {
    super(
      `Batas ${BATAS_KODE_PER_JAM} permintaan Kode Masuk per jam dari satu IP tercapai. Boleh lagi sekitar ${bolehLagi.toISOString()}. ` +
        "Jalankan ulang nanti (sesi yang sudah tersimpan dipakai lagi), atau naikkan UAT_KODE_TUNGGU_MAKS_MENIT bila mau menunggu di sini.",
    );
    this.name = "BatasKodeTercapai";
  }
}

export interface JedaKodeMasukDeps {
  /** The JSON file that keeps the request times between runs. */
  berkas: string;
  sekarang: () => number;
  tidur: (ms: number) => Promise<void>;
  catat?: (pesan: string) => void;
  margin?: number;
  maksTungguMs?: number;
}

function bacaRiwayat(berkas: string): number[] {
  try {
    const isi: unknown = JSON.parse(readFileSync(berkas, "utf8"));
    return Array.isArray(isi) ? isi.filter((waktu): waktu is number => typeof waktu === "number" && Number.isFinite(waktu)) : [];
  } catch {
    return [];
  }
}

/** The runner's gate in front of every request for an emailed code. */
export class JedaKodeMasuk {
  constructor(private readonly deps: JedaKodeMasukDeps) {}

  /**
   * Returns when one more request for a Kode Masuk may go out, and records it. It
   * waits out the 60 s gap itself; a wait longer than `maksTungguMs` (the hour is
   * full) is refused with {@link BatasKodeTercapai}.
   */
  async sebelumMintaKode(): Promise<void> {
    for (;;) {
      const sekarang = this.deps.sekarang();
      const riwayat = bacaRiwayat(this.deps.berkas);
      const keputusan = putuskanKirimKode(riwayat, sekarang, { margin: this.deps.margin, maksTungguMs: this.deps.maksTungguMs });
      if (keputusan.jenis === "tolak") throw new BatasKodeTercapai(keputusan.bolehLagi);
      if (keputusan.jenis === "tunggu") {
        this.deps.catat?.(`Menunggu ${Math.ceil(keputusan.ms / 1000)} detik sebelum meminta Kode Masuk berikutnya (batas server: 60 detik dan 5 per jam).`);
        await this.deps.tidur(keputusan.ms);
        continue;
      }
      // Keep only what can still matter: the last hour.
      const disimpan = riwayat.filter((waktu) => waktu > sekarang - JENDELA_KODE_MS);
      mkdirSync(dirname(this.deps.berkas), { recursive: true });
      writeFileSync(this.deps.berkas, JSON.stringify([...disimpan, sekarang]));
      return;
    }
  }
}
