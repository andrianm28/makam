import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { suratKuasaRenderPath, suratKuasaRenderSah } from "./surat-kuasa-link";

const SECRET = "x".repeat(40);
const sekarang = new Date("2026-10-02T05:00:00Z");
const queryDari = (path: string) => Object.fromEntries(new URL(path, "http://x").searchParams) as { sampai?: string; tanda?: string };

describe("the Surat Kuasa render link", () => {
  it("is valid for its own Nomor Pemesanan for two minutes only", () => {
    const path = suratKuasaRenderPath(SECRET, "MKM-2026-000001", sekarang);
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000001", queryDari(path), new Date(sekarang.getTime() + 119_000))).toBe(true);
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000001", queryDari(path), new Date(sekarang.getTime() + 121_000))).toBe(false);
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000002", queryDari(path), sekarang)).toBe(false);
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000001", { sampai: queryDari(path).sampai, tanda: "x" }, sekarang)).toBe(false);
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000001", {}, sekarang)).toBe(false);
  });

  it("refuses a link MACed with the raw AUTH_SECRET: the link has a key of its own", () => {
    const sampai = sekarang.getTime() + 60_000;
    const tanda = createHmac("sha256", SECRET).update(`surat-kuasa-render:MKM-2026-000001:${sampai}`).digest("base64url");
    expect(suratKuasaRenderSah(SECRET, "MKM-2026-000001", { sampai: String(sampai), tanda }, sekarang)).toBe(false);
  });
});
