import type { Clock } from "@/ports/clock";
import type { FileStore, StoredFile } from "@/ports/file-store";
import type { PdfRenderer, PdfRenderRequest } from "@/ports/pdf-renderer";

/** Keeps files in memory; `stored` shows what was uploaded. */
export class FakeFileStore implements FileStore {
  readonly stored = new Map<string, StoredFile>();
  readonly #clock: Clock;

  constructor(options: { clock: Clock }) {
    this.#clock = options.clock;
  }

  async put(file: StoredFile): Promise<{ key: string }> {
    this.stored.set(file.key, { ...file, body: new Uint8Array(file.body) });
    return { key: file.key };
  }

  async signedUrl(key: string, options: { expiresInSeconds: number }): Promise<string> {
    if (!this.stored.has(key)) throw new Error(`No file stored at ${key}`);
    const expires = Math.floor(this.#clock.now().getTime() / 1000) + options.expiresInSeconds;
    return `https://files.fake.local/${encodeURI(key)}?expires=${expires}`;
  }

  async delete(key: string): Promise<void> {
    this.stored.delete(key);
  }
}

const MINIMAL_PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** Records each page rendered and returns a minimal valid PDF. */
export class FakePdfRenderer implements PdfRenderer {
  readonly rendered: PdfRenderRequest[] = [];

  async render(request: PdfRenderRequest): Promise<Uint8Array> {
    this.rendered.push(request);
    return new Uint8Array(MINIMAL_PDF);
  }
}
