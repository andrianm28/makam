import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/*
 * The code filler (`npm run uat:kode`) stands where the owner stood in a UAT run:
 * it watches `$UAT_OUT/kode` for the runner's `<persona>.minta`, reads the newest
 * Kode Masuk sent to that persona's email and writes the six digits to
 * `<persona>.txt`, which the runner types and deletes (support/kode.ts).
 *
 * Two mailboxes: Stalwart over JMAP (the host's UAT against staging, the personas'
 * makam.co.id addresses, read only) and the development stack's in-memory outbox
 * (`/api/dev/email-outbox`, a local stack only). The runner is unchanged: it still
 * knows nothing about mailboxes.
 */

/** Where a Kode Masuk for an address is read from. */
export interface SumberKode {
  /** The code of the newest Kode Masuk email to `email` received at or after `sejak`, or null when none has arrived. */
  kodeTerbaru(email: string, sejak: Date): Promise<string | null>;
}

/** The code in a Kode Masuk subject (`Kode Masuk Makam.co.id: 123456`, identity/email-templates.ts); other mail is null. */
export function kodeDariSubjek(subject: string): string | null {
  return /^Kode Masuk Makam\.co\.id: (\d{6})$/.exec(subject.trim())?.[1] ?? null;
}

/** A send can land a moment before the runner stamps `sejak` (it presses the button first); the window opens this much earlier. */
const KELONGGARAN_MS = 90_000;

const mintaSchema = z.object({ persona: z.string().min(1), jenis: z.literal("kode-masuk"), sejak: z.iso.datetime() });

export interface IsiKodeDeps {
  /** `$UAT_OUT/kode` */
  dir: string;
  /** The persona's email, or null when the run has none for it. */
  emailUntuk: (persona: string) => string | null;
  sumber: SumberKode;
  /** `persona:code` already written in this process: a code is given once, so a used one is never typed again. */
  dipakai: Set<string>;
  catat?: (pesan: string) => void;
}

/** One pass over the waiting requests; returns the personas whose code it wrote. */
export async function isiKodeSekali(deps: IsiKodeDeps): Promise<string[]> {
  if (!existsSync(deps.dir)) return [];
  const terisi: string[] = [];
  for (const nama of readdirSync(deps.dir).filter((berkas) => berkas.endsWith(".minta")).sort()) {
    let minta: z.infer<typeof mintaSchema>;
    try {
      minta = mintaSchema.parse(JSON.parse(readFileSync(join(deps.dir, nama), "utf8")));
    } catch {
      continue; // half written, or gone between the listing and the read: the next pass sees it whole
    }
    // A code already waiting is the runner's to type; never overwrite it.
    if (existsSync(join(deps.dir, `${minta.persona}.txt`))) continue;
    const email = deps.emailUntuk(minta.persona);
    if (!email) {
      deps.catat?.(`persona ${minta.persona} tidak punya email di lingkungan ini; isi kodenya sendiri`);
      continue;
    }
    const sejak = new Date(Date.parse(minta.sejak) - KELONGGARAN_MS);
    const kode = await deps.sumber.kodeTerbaru(email, sejak);
    if (!kode || deps.dipakai.has(`${minta.persona}:${kode}`)) continue;
    writeFileSync(join(deps.dir, `${minta.persona}.txt`), `${kode}\n`, { mode: 0o600 });
    deps.dipakai.add(`${minta.persona}:${kode}`);
    deps.catat?.(`kode-masuk untuk persona ${minta.persona} ditulis`);
    terisi.push(minta.persona);
  }
  return terisi;
}

const outboxSchema = z.object({ messages: z.array(z.object({ subject: z.string() })) });

/** The development stack's outbox (404 anywhere the live EmailSender is wired). */
export function sumberOutbox(opsi: { baseUrl: string; fetch?: typeof fetch }): SumberKode {
  const ambil = opsi.fetch ?? fetch;
  return {
    async kodeTerbaru(email) {
      const url = `${opsi.baseUrl.replace(/\/$/, "")}/api/dev/email-outbox?to=${encodeURIComponent(email.toLowerCase())}`;
      const jawaban = await ambil(url);
      if (!jawaban.ok) throw new Error(`outbox menjawab ${jawaban.status}: hanya stack development yang punya outbox`);
      const { messages } = outboxSchema.parse(await jawaban.json());
      for (const pesan of [...messages].reverse()) {
        const kode = kodeDariSubjek(pesan.subject);
        if (kode) return kode;
      }
      return null;
    },
  };
}

export const kredensialJmapSchema = z.record(
  z.string().transform((email) => email.toLowerCase()),
  z.union([z.string().min(1), z.object({ user: z.string().min(1), password: z.string().min(1) })]),
);
export type KredensialJmap = z.infer<typeof kredensialJmapSchema>;

const sesiSchema = z.object({
  apiUrl: z.url(),
  primaryAccounts: z.object({ "urn:ietf:params:jmap:mail": z.string().min(1) }),
});
const jawabanSchema = z.object({
  methodResponses: z.array(z.tuple([z.string(), z.unknown(), z.string()])),
});
const daftarEmailSchema = z.object({
  list: z.array(z.object({ subject: z.string().nullable(), receivedAt: z.string() })),
});

/**
 * Stalwart (or any JMAP server, RFC 8621): each persona signs in to its own account
 * with basic auth and reads only subjects and receive times of mail since the request.
 */
export function sumberJmap(opsi: { sesiUrl: string; kredensial: KredensialJmap; fetch?: typeof fetch }): SumberKode {
  const ambil = opsi.fetch ?? fetch;
  const kredensial = new Map(Object.entries(opsi.kredensial).map(([email, k]) => [email.toLowerCase(), k]));
  const sesi = new Map<string, z.infer<typeof sesiSchema>>();

  return {
    async kodeTerbaru(email, sejak) {
      const k = kredensial.get(email.toLowerCase());
      if (!k) throw new Error(`tidak ada kredensial JMAP untuk ${email} di berkas kredensial`);
      const user = typeof k === "string" ? email : k.user;
      const password = typeof k === "string" ? k : k.password;
      const headers = {
        authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
        "content-type": "application/json",
      };

      let s = sesi.get(email);
      if (!s) {
        const jawaban = await ambil(opsi.sesiUrl, { headers });
        if (!jawaban.ok) throw new Error(`sesi JMAP untuk ${email} menjawab ${jawaban.status}`);
        s = sesiSchema.parse(await jawaban.json());
        sesi.set(email, s);
      }
      const accountId = s.primaryAccounts["urn:ietf:params:jmap:mail"];
      const jawaban = await ambil(s.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [
            [
              "Email/query",
              {
                accountId,
                filter: { after: sejak.toISOString(), subject: "Kode Masuk" },
                sort: [{ property: "receivedAt", isAscending: false }],
                limit: 10,
              },
              "q",
            ],
            [
              "Email/get",
              { accountId, "#ids": { resultOf: "q", name: "Email/query", path: "/ids" }, properties: ["subject", "receivedAt"] },
              "g",
            ],
          ],
        }),
      });
      if (!jawaban.ok) throw new Error(`JMAP untuk ${email} menjawab ${jawaban.status}`);
      const { methodResponses } = jawabanSchema.parse(await jawaban.json());
      const get = methodResponses.find(([nama]) => nama === "Email/get");
      if (!get) throw new Error(`JMAP untuk ${email} tidak menjawab Email/get: ${JSON.stringify(methodResponses[0]?.[1] ?? null)}`);
      const terbaru = daftarEmailSchema
        .parse(get[1])
        .list.filter((m) => Date.parse(m.receivedAt) >= sejak.getTime())
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
      for (const m of terbaru) {
        const kode = kodeDariSubjek(m.subject ?? "");
        if (kode) return kode;
      }
      return null;
    },
  };
}
