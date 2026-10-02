import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every Kode Masuk step of a Kirim (both wizards, Layanan and its TPU form) is
 * handed the same Server Action, `kirimKodeMasuk`, so what the /masuk tests show
 * about a failing EmailSender ("gagal kirim", no retry, a resend goes out) holds
 * at each of them. A wizard that wired in its own action would escape those tests.
 */
const wizardPages = [
  "src/app/pesan-makam/terencana/page.tsx",
  "src/app/pesan-makam/saat-duka/data/page.tsx",
  "src/app/pesan-makam/saat-duka/tpu/page.tsx",
  "src/app/layanan/page.tsx",
  "src/app/layanan/tpu/page.tsx",
];

describe("Kirim's Kode Masuk step", () => {
  it.each(wizardPages)("%s requests the Kode Masuk through the one action Masuk uses", (page) => {
    const source = readFileSync(page, "utf8");
    expect(source).toContain('import { kirimKodeMasuk } from "@/app/(site)/masuk/actions";');
    expect(source).toMatch(/mintaKodeMasuk=\{kirimKodeMasuk\}/);
  });
});
