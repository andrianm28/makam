import { readRilisEnv } from "./env";
import { terbukaDi, type Fitur, type Rilis } from "./rilis-peta";

export { fiturUntukRute, fiturUntukTick, permukaanRute, type Fitur, type Rilis } from "./rilis-peta";

/** The release number this process was started with (`RILIS_TERBUKA`, ADR 0006). */
export function rilisAktif(source: Record<string, string | undefined> = process.env): Rilis {
  return readRilisEnv(source);
}

/** Whether `fitur` is open in this environment: the one question every gate asks. */
export function rilisTerbuka(fitur: Fitur, source: Record<string, string | undefined> = process.env): boolean {
  return terbukaDi(fitur, rilisAktif(source));
}
