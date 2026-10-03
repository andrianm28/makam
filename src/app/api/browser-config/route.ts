import { connection } from "next/server";
import { browserSentryDsn, paymentsAreTrial } from "@/lib/env";

/**
 * What the browser needs from the server at runtime, for the one value that
 * cannot be baked into a shared image: the GlitchTip DSN this process was
 * started with, and whether payments are a trial (ticket 101). The home page
 * is statically rendered, so its HTML is written at build time (where there is
 * no environment at all) and must not carry them.
 *
 * The DSN is public by design, so the browser may ask for it. `no-store`: two
 * environments share this code, and a proxy must not hand one environment's DSN
 * to the other.
 */
export async function GET() {
  await connection(); // per request, never cached
  return Response.json(
    { sentryDsn: browserSentryDsn(), paymentTrial: paymentsAreTrial() },
    { headers: { "cache-control": "no-store" } },
  );
}
