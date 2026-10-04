import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
 * What one journey hands to the next (the Nomor Pemesanan it created, the link of
 * its Tagihan), kept in `$UAT_OUT/keadaan.json`: a journey run alone, or run
 * again after a fix, picks up where the earlier one stopped, as long as it is
 * given the same UAT_OUT.
 */

/** Every value a journey hands to a later one. A key nobody reads does not belong here; a typo is a type error. */
export type KunciKeadaan =
  | "terencana.nomor"
  | "terencana.nomorTagihan"
  | "terencana.tagihanUrl"
  | "saatduka.nomor"
  | "saatduka.lokasiId"
  | "saatduka.tagihanUrl"
  | "saatduka.hakPakaiId"
  | "perpanjangan.permohonan"
  | "layanan.nomor"
  | "layanan.tagihanUrl"
  | "tumpang.nomor"
  | "tpu.layanan.nomor"
  | "iptm.nomor"
  | "tpu.saatduka.nomor"
  | "berhenti.lokasiId";

/** `$UAT_OUT`: set by the Playwright config for the main process and every worker. */
export function keluaranDir(): string {
  const out = process.env.UAT_OUT;
  if (!out) throw new Error("UAT_OUT belum ditetapkan: jalankan lewat `npm run uat`.");
  return out;
}

function berkasKeadaan(): string {
  return join(keluaranDir(), "keadaan.json");
}

function muat(): Record<string, string> {
  try {
    return existsSync(berkasKeadaan()) ? (JSON.parse(readFileSync(berkasKeadaan(), "utf8")) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function simpan(kunci: KunciKeadaan, nilai: string): void {
  mkdirSync(keluaranDir(), { recursive: true });
  writeFileSync(berkasKeadaan(), JSON.stringify({ ...muat(), [kunci]: nilai }, null, 2));
}

export function baca(kunci: KunciKeadaan): string | undefined {
  return muat()[kunci];
}

/** A value an earlier journey was to leave behind; a clear error, naming that journey, when it did not. */
export function wajib(kunci: KunciKeadaan, dariPerjalanan: string): string {
  const nilai = baca(kunci);
  if (!nilai) throw new Error(`"${kunci}" belum ada: jalankan perjalanan "${dariPerjalanan}" lebih dulu (dengan UAT_OUT yang sama).`);
  return nilai;
}
