import { describe, expect, it } from "vitest";
import type { QuotedLine } from "@/domain/tariffs";
import { quoteLineLabel } from "./quote-line-label";

const base = { amount: 0, inForceSince: "2026-10-01", scheduledChange: null } as unknown as Pick<
  QuotedLine,
  "amount" | "inForceSince" | "scheduledChange"
>;
const lokasi = { provider: { kind: "lokasi_mitra", lokasiId: "l" } } as const;
const operator = { provider: { kind: "operator" } } as const;

describe("the name of a quote line, as a page or a Tagihan shows it", () => {
  it.each<[QuotedLine, string]>([
    [{ ...base, ...lokasi, kind: "harga_hak_pakai", jenisMakamId: "j", jenisMakamName: "Reguler", tenure: { kind: "tahun", years: 5 } }, "Harga Hak Pakai – Reguler"],
    [{ ...base, ...lokasi, kind: "biaya_pemakaman", lokasiId: "l", tumpang: false }, "Biaya Pemakaman"],
    [{ ...base, ...lokasi, kind: "biaya_pemakaman", lokasiId: "l", tumpang: true }, "Biaya Pemakaman (tumpang)"],
    [
      { ...base, ...lokasi, kind: "perpanjangan", jenisMakamId: "j", jenisMakamName: "Reguler", tenure: { kind: "tahun", years: 5 }, terms: 2 },
      "Perpanjangan Makam – Reguler (2 × 5 tahun)",
    ],
    [{ ...base, ...operator, kind: "biaya_pengurusan", pengurusan: "pemakaman" }, "Biaya Pengurusan"],
    [{ ...base, ...operator, kind: "biaya_pengurusan", pengurusan: "berkas" }, "Biaya Pengurusan (hanya berkas)"],
    [{ ...base, provider: { kind: "pemda" }, kind: "retribusi_pemda", retribusi: "iptm", setorRetribusi: false }, "Retribusi Pemda (IPTM)"],
    [{ ...base, ...operator, kind: "biaya_layanan_platform", bagian: { platform: 150_000, administrasi: 0 } as never }, "Biaya Layanan Platform"],
    [
      { ...base, ...operator, kind: "biaya_layanan_platform", bagian: { platform: 100_000, administrasi: 150_000 } as never },
      "Biaya Layanan Platform (platform Rp 100.000, administrasi Rp 150.000)",
    ],
  ])("%j → %s", (line, label) => {
    expect(quoteLineLabel(line)).toBe(label);
  });
});
