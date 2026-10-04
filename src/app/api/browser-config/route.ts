import { connection } from "next/server";
import { browserSentryDsn, paymentsAreTrial } from "@/lib/env";
import { serverRuntime } from "@/server/runtime";

/**
 * What the browser needs from the server at runtime, for the one value that
 * cannot be baked into a shared image: the GlitchTip DSN this process was
 * started with, and whether payments are a trial (ticket 101). The home page
 * is statically rendered, so its HTML is written at build time (where there is
 * no environment at all) and must not carry them.
 *
 * `contohAktif` (ticket 109) is whether the Data Contoh registry holds an active entry, which
 * adds a line to the trial banner and which `makam-preflight` reads from the running stack.
 * It is null, never false, when the registry cannot be read (an error, or no answer within a
 * short time limit): the browser reads null as "not active", the preflight as "unknown", and a
 * failed read must never pass for an empty registry.
 *
 * The DSN is public by design, so the browser may ask for it. `no-store`: two
 * environments share this code, and a proxy must not hand one environment's DSN
 * to the other.
 */
export async function GET() {
  await connection(); // per request, never cached
  const sentryDsn = browserSentryDsn();
  const paymentTrial = paymentsAreTrial();
  return Response.json({ sentryDsn, paymentTrial, contohAktif: await contohAktif() }, { headers: { "cache-control": "no-store" } });
}

/** How long the registry read may take: the browser asks for the DSN on every page, so a database that hangs must not hold the answer up. */
const BATAS_BACA_MS = 2_000;

async function contohAktif(): Promise<boolean | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const habis = new Promise<null>((selesai) => {
      timer = setTimeout(() => selesai(null), BATAS_BACA_MS);
    });
    return await Promise.race([serverRuntime().dataContoh.aktif(), habis]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
