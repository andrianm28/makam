import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The owner reads a Kode Masuk (or an authenticator code, for an Admin Platform)
 * out of their mailbox or phone; the orchestrator writes it to
 * `$UAT_OUT/kode/<persona>.txt` and the runner types it. Nothing else crosses
 * between the two: the runner has no mailbox access and never sees a TOTP secret.
 *
 * While the runner waits it leaves `<persona>.minta` (JSON: who, which kind of
 * code, which file) so whoever drives it can see that a code is wanted.
 */

export type JenisKode = "kode-masuk" | "totp";

/** Six digits, with spaces, line breaks and hyphens ignored; anything else is not a code. */
export function bacaKode(isi: string): string | null {
  const bersih = isi.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(bersih) ? bersih : null;
}

/** No code arrived in time. */
export class KodeTidakDiberikan extends Error {
  constructor(persona: string, jenis: JenisKode, berkas: string, menit: number) {
    super(
      `Tidak ada ${jenis} untuk persona "${persona}" dalam ${menit} menit. Tulis 6 angkanya ke ${berkas} (satu baris), lalu jalankan ulang.`,
    );
    this.name = "KodeTidakDiberikan";
  }
}

export interface MintaKodeDeps {
  /** `$UAT_OUT/kode` */
  dir: string;
  persona: string;
  jenis: JenisKode;
  timeoutMs: number;
  sekarang: () => number;
  tidur: (ms: number) => Promise<void>;
  /** Does what makes the code go out (presses "Kirim Kode Masuk"); a code on screen already needs nothing. */
  kirim: () => Promise<void>;
  catat?: (pesan: string) => void;
  intervalMs?: number;
}

/**
 * Removes any code left from before, sends, announces the request and waits for
 * the six digits to appear in `<persona>.txt`; the file is used up when read, so a
 * code is never typed twice. Removing the old file comes before the send, so the
 * owner's answer to this request can never be mistaken for a leftover.
 */
export async function mintaKode(deps: MintaKodeDeps): Promise<string> {
  const berkas = join(deps.dir, `${deps.persona}.txt`);
  const penanda = join(deps.dir, `${deps.persona}.minta`);
  const interval = deps.intervalMs ?? 1_000;
  mkdirSync(deps.dir, { recursive: true });
  rmSync(berkas, { force: true });

  await deps.kirim();

  const mulai = deps.sekarang();
  writeFileSync(penanda, JSON.stringify({ persona: deps.persona, jenis: deps.jenis, berkas, sejak: new Date(mulai).toISOString() }));
  deps.catat?.(`MENUNGGU ${deps.jenis} untuk persona ${deps.persona}: tulis 6 angka ke ${berkas}`);
  let diabaikan: string | null = null;
  try {
    for (;;) {
      if (existsSync(berkas)) {
        const isi = readFileSync(berkas, "utf8");
        const kode = bacaKode(isi);
        if (kode) {
          rmSync(berkas, { force: true });
          return kode;
        }
        // Not deleted: it may be half written. Said once, then the wait goes on.
        if (isi !== diabaikan) deps.catat?.(`Isi ${berkas} bukan 6 angka; menunggu isian yang benar.`);
        diabaikan = isi;
      }
      if (deps.sekarang() - mulai >= deps.timeoutMs) {
        throw new KodeTidakDiberikan(deps.persona, deps.jenis, berkas, Math.round(deps.timeoutMs / 60_000));
      }
      await deps.tidur(interval);
    }
  } finally {
    rmSync(penanda, { force: true });
  }
}
