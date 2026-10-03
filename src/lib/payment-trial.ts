/**
 * Asks the running server whether payments are a trial (ticket 101), through
 * `/api/browser-config`: a runtime answer, because one image serves staging and
 * production and statically rendered pages cannot read the environment. Any
 * failure reads as "not a trial", so the banner stays hidden rather than guess.
 */
export async function fetchPaymentTrial(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher("/api/browser-config", { cache: "no-store" });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && (body as { paymentTrial?: unknown }).paymentTrial === true;
  } catch {
    return false;
  }
}
