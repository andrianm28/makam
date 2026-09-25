/**
 * PdfRenderer port: turns a document web page (a Tagihan, a Bukti ...) into a PDF.
 */
export interface PdfRenderRequest {
  /** The document page to render. */
  url: string;
}

export interface PdfRenderer {
  render(request: PdfRenderRequest): Promise<Uint8Array>;
}
