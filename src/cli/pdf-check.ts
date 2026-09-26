/**
 * `node dist/pdf-check.mjs [url]` in the image (or `npx tsx src/cli/pdf-check.ts [url]`):
 * renders one page to PDF with the live PdfRenderer (the image's headless
 * Chromium at CHROMIUM_PATH) and prints the PDF's size. Proves "Unduh PDF" can
 * work in this container. Default page: the web server's home page
 * (DOCUMENT_PAGE_ORIGIN, else http://127.0.0.1:$PORT). Needs no database.
 * See docs/ops/runbook.md, "Test PDF".
 */
import { ChromiumPdfRenderer } from "@/adapters/live/chromium-pdf-renderer";
import { DEFAULT_CHROMIUM_PATH } from "@/lib/env";
import { cliFailure } from "./cli-failure";

async function main(args: string[]): Promise<string> {
  const origin = process.env.DOCUMENT_PAGE_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const url = args[0] ?? `${origin}/`;
  const executablePath = process.env.CHROMIUM_PATH || DEFAULT_CHROMIUM_PATH;
  const pdf = await new ChromiumPdfRenderer({ executablePath }).render({ url });
  return `OK: ${url} dirender menjadi PDF ${pdf.byteLength} byte dengan ${executablePath}.`;
}

main(process.argv.slice(2))
  .then((output) => {
    console.log(`[pdf-check] ${output}`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`[pdf-check] ${cliFailure(error)}`);
    if (error instanceof Error && error.message.startsWith("PdfRenderer")) console.error(`[pdf-check] ${error.message.split("\n")[0]}`);
    process.exit(1);
  });
