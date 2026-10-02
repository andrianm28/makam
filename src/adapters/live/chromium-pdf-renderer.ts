import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scrubbedError, type ReportError } from "@/lib/observability/report-error";
import type { PdfRenderer, PdfRenderRequest } from "@/ports/pdf-renderer";

export interface ChromiumPdfRendererOptions {
  /** The headless Chromium binary: in the image, Debian's chromium-headless-shell (`CHROMIUM_PATH`). */
  executablePath: string;
  /** How long one render may take before it is abandoned. Default 30 s. */
  timeoutMs?: number;
  /** Where a work directory that could not be removed is reported; the render still succeeds. */
  reportError?: ReportError;
}

/**
 * The live PdfRenderer: prints a document web page to PDF with a headless
 * Chromium run once per document (`--print-to-pdf`), so no browser stays
 * resident in the web container. The page's own print CSS (`@page`) sets the
 * paper; Chromium's header and footer are off.
 *
 * The page is first fetched once to check it answers 200, so an error page is
 * never handed out as a document. Chromium runs without its sandbox: it only
 * ever opens the app's own document pages, and the container is the boundary.
 */
export class ChromiumPdfRenderer implements PdfRenderer {
  readonly #executablePath: string;
  readonly #timeoutMs: number;
  readonly #reportError: ReportError | undefined;

  constructor(options: ChromiumPdfRendererOptions) {
    this.#executablePath = options.executablePath;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#reportError = options.reportError;
  }

  async render(request: PdfRenderRequest): Promise<Uint8Array> {
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`PdfRenderer only opens http(s) document pages, not ${url.protocol}`);
    }
    const page = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(this.#timeoutMs) });
    await page.body?.cancel();
    if (page.status !== 200) throw new Error(`PdfRenderer: the document page answered ${page.status}`);

    const workDir = await mkdtemp(join(tmpdir(), "makam-pdf-"));
    const output = join(workDir, "document.pdf");
    try {
      await this.#runChromium(workDir, output, url.href);
      const bytes = await readFile(output);
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("PdfRenderer: Chromium wrote no PDF");
      return new Uint8Array(bytes);
    } finally {
      await this.#removeWorkDir(workDir);
    }
  }

  /**
   * Chromium's helper processes may still write into the profile after the main
   * process exits, so the removal is retried. A directory that stays behind is
   * only litter in the temp dir: it is reported and never fails the render.
   */
  async #removeWorkDir(workDir: string): Promise<void> {
    try {
      await rm(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      // The error message carries the temp path only (random name), nothing about the document.
      this.#reportError?.(scrubbedError(error), { tags: { area: "pdf-renderer", step: "cleanup" } });
    }
  }

  #runChromium(workDir: string, output: string, url: string): Promise<void> {
    const args = [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      `--user-data-dir=${join(workDir, "profile")}`,
      // Let the page load (fonts included) before printing.
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=10000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${output}`,
      url,
    ];
    return new Promise((resolve, reject) => {
      execFile(this.#executablePath, args, { timeout: this.#timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (!error) return resolve();
        // Never error.message: it repeats the command line, and so the document's link.
        const { code, signal, killed } = error as NodeJS.ErrnoException & { signal?: string; killed?: boolean };
        const why =
          code === "ENOENT"
            ? `not found at ${this.#executablePath}`
            : killed
              ? `gave no PDF within ${this.#timeoutMs} ms`
              : `exited with ${signal ?? code}\n${String(stderr).replaceAll(url, "<document page>").slice(-2000)}`;
        reject(new Error(`PdfRenderer: headless Chromium failed: ${why}`));
      });
    });
  }
}
