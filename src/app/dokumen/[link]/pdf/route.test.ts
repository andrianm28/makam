import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakePdfRenderer } from "@/adapters/memory";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { browser } from "../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
  (server.runtime().adapters.pdf as FakePdfRenderer).rendered.length = 0;
});

async function issuedTagihan() {
  const admin = await signInAsAdminPlatform(server);
  const { operatorSettings, billing } = server.runtime();
  await operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  browser.reset();
  const issued = await billing.issueTagihan({
    moment: { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") },
    addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: "Makam Wakaf Al-Ikhlas",
    lines: [
      {
        kind: "harga_hak_pakai",
        label: "Harga Hak Pakai – Makam Standar",
        amount: 5_000_000 as Rupiah,
        provider: { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" },
      },
    ],
  });
  if (!issued.ok) throw new Error(issued.reason);
  return issued.tagihan;
}

const download = (link: string) =>
  GET(new Request(`http://localhost/dokumen/${link}/pdf`), { params: Promise.resolve({ link }) });

describe("GET /dokumen/<link>/pdf (Unduh PDF)", () => {
  it("anyone with the link downloads the Tagihan as a PDF named after its number, rendered from its own page", async () => {
    const tagihan = await issuedTagihan();

    const response = await download(tagihan.link);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="TGH-2026-000001.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new TextDecoder().decode((await response.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect((server.runtime().adapters.pdf as FakePdfRenderer).rendered).toEqual([
      { url: `http://127.0.0.1:3000/dokumen/${tagihan.link}` },
    ]);
  });

  it("a link that is no document's is not found, and nothing is rendered", async () => {
    await issuedTagihan();

    expect((await download("x".repeat(43))).status).toBe(404);
    expect((await download("../../etc")).status).toBe(404);
    expect((server.runtime().adapters.pdf as FakePdfRenderer).rendered).toEqual([]);
  });
});
