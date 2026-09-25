/**
 * What an ops CLI prints when it stops on an unexpected error: a short message
 * with the error's name and code only. Never the message itself, which may
 * carry a connection string, a phone number or a secret.
 */
export function cliFailure(error: unknown): string {
  const name = error instanceof Error && /^\w{1,64}$/.test(error.name) ? error.name : "Error";
  const code = (error as { code?: unknown } | null)?.code;
  const safeCode = typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? ` ${code}` : "";
  return `Gagal: perintah berhenti karena galat (${name}${safeCode}).`;
}
