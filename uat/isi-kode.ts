import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bacaDipakai, isiKodeSekali, kredensialJmapSchema, sumberJmap, sumberOutbox, type SumberKode } from "./support/pengisi-kode";
import { PERSONA, type NamaPersona } from "./support/persona";

/*
 * `npm run uat:kode -- --sumber jmap|outbox`: runs beside `npm run uat` with the same
 * UAT_OUT and UAT_EMAIL_* and writes every Kode Masuk the runner waits for
 * (support/pengisi-kode.ts). Stops on Ctrl-C, or by itself after UAT_KODE_ISI_MENIT
 * (default 240) minutes.
 *
 *   jmap:   UAT_JMAP_SESI_URL (e.g. https://mail.makam.co.id/jmap/session) and
 *           UAT_JMAP_KREDENSIAL, a JSON file (chmod 600, never committed):
 *           { "<email>": "<password>" } or { "<email>": { "user": "<login>", "password": "<pw>" } }
 *   outbox: UAT_BASE_URL of a local development stack (refused for any other host).
 */

const argSumber = process.argv.indexOf("--sumber");
const jenis = argSumber >= 0 ? process.argv[argSumber + 1] : undefined;
const out = process.env.UAT_OUT?.trim();
if (!out) throw new Error("UAT_OUT belum diisi: pakai folder yang sama dengan `npm run uat`.");

function sumber(): SumberKode {
  if (jenis === "jmap") {
    const sesiUrl = process.env.UAT_JMAP_SESI_URL?.trim();
    const berkas = process.env.UAT_JMAP_KREDENSIAL?.trim();
    if (!sesiUrl || !berkas) throw new Error("Sumber jmap butuh UAT_JMAP_SESI_URL dan UAT_JMAP_KREDENSIAL.");
    return sumberJmap({ sesiUrl, kredensial: kredensialJmapSchema.parse(JSON.parse(readFileSync(berkas, "utf8"))) });
  }
  if (jenis === "outbox") {
    const baseUrl = process.env.UAT_BASE_URL?.trim() ?? "";
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(baseUrl)) {
      throw new Error("Sumber outbox hanya untuk stack lokal (UAT_BASE_URL http://127.0.0.1:<port>).");
    }
    return sumberOutbox({ baseUrl });
  }
  throw new Error("Pakai --sumber jmap (host, Stalwart) atau --sumber outbox (stack lokal).");
}

const emailUntuk = (persona: string) => {
  const definisi = PERSONA[persona as NamaPersona];
  return definisi ? (process.env[definisi.env]?.trim().toLowerCase() ?? null) || null : null;
};

const catat = (pesan: string) => console.log(`[UAT kode] ${pesan}`);
const s = sumber();
const dipakai = bacaDipakai(join(out, "kode"));
const batas = Date.now() + Number(process.env.UAT_KODE_ISI_MENIT ?? 240) * 60_000;
catat(`mengawasi ${join(out, "kode")} (sumber ${jenis})`);
while (Date.now() < batas) {
  try {
    await isiKodeSekali({ dir: join(out, "kode"), emailUntuk, sumber: s, dipakai, catat });
  } catch (galat) {
    catat(`gagal membaca kotak surat: ${(galat as Error).message}`);
  }
  await new Promise((selesai) => setTimeout(selesai, 3_000));
}
catat("batas waktu habis, berhenti");
