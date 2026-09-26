import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findChromium } from "../../../tests/support/chromium";
import { ChromiumPdfRenderer } from "./chromium-pdf-renderer";

/**
 * The real PdfRenderer against a real headless Chromium (the image's
 * chromium-headless-shell, a local Chrome or Chromium, or CHROMIUM_PATH).
 * It runs everywhere the suite runs, CI included: no Chromium is a failure, not a skip.
 */
const DOCUMENT_PAGE = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Tagihan TGH/2026/000001</title>
<style>@page { size: A4; margin: 16mm; } body { font-family: sans-serif; }</style></head>
<body><h1>Tagihan</h1><p>PT Jaya Korpora Prima</p><p>Total Rp 5.150.000</p></body></html>`;

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/dokumen/contoh") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(DOCUMENT_PAGE);
    } else {
      response.writeHead(404).end("tidak ditemukan");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("ChromiumPdfRenderer", () => {
  it("renders a document web page into an A4 PDF", { timeout: 60_000 }, async () => {
    const renderer = new ChromiumPdfRenderer({ executablePath: findChromium() });

    const pdf = await renderer.render({ url: `${origin}/dokumen/contoh` });

    const text = Buffer.from(pdf).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toMatch(/\/Type\s*\/Page\b/);
    // A4 is 595.28 × 841.89 points (Letter, Chromium's default, would be 612 × 792).
    const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
    expect(mediaBox?.slice(1).map((points) => Math.round(Number(points)))).toEqual([595, 842]);
  });

  it("refuses a page that is not http(s) instead of opening it", async () => {
    const renderer = new ChromiumPdfRenderer({ executablePath: findChromium() });

    await expect(renderer.render({ url: "file:///etc/passwd" })).rejects.toThrow(/http/);
  });

  it("fails loudly when the page does not load", { timeout: 60_000 }, async () => {
    const renderer = new ChromiumPdfRenderer({ executablePath: findChromium() });

    await expect(renderer.render({ url: `${origin}/dokumen/tidak-ada` })).rejects.toThrow(/404/);
  });

  it("fails loudly when Chromium is missing", async () => {
    const renderer = new ChromiumPdfRenderer({ executablePath: "/nonexistent/chromium" });

    await expect(renderer.render({ url: `${origin}/dokumen/contoh` })).rejects.toThrow(/Chromium/);
  });
});
