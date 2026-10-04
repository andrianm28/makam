import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FullResult, TestCase, TestResult } from "@playwright/test/reporter";
import { afterEach, describe, expect, it } from "vitest";
import RingkasanReporter from "../../uat/support/ringkasan";

/*
 * What the owner and the orchestrator read after a UAT run is `ringkasan.md`
 * (ticket 110). Gate G2 says "all [BAYAR] journeys green, the runner reports 0
 * failed", so the summary must never let a journey that did not run read like one
 * that passed, and must keep what an earlier run on the same folder already proved.
 */

const folders: string[] = [];
afterEach(() => {
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
});

interface Perjalanan {
  judul: string;
  tag?: string[];
  hasil: "passed" | "failed" | "skipped" | "timedOut";
  catatan?: { type: string; description?: string }[];
  langkah?: { judul: string; galat?: string }[];
  galat?: string;
}

/** The two things Playwright hands a reporter for one journey, with just the fields the summary reads. */
function selesai(satu: Perjalanan): [TestCase, TestResult] {
  const uji = {
    titlePath: () => ["", "chromium", "rilis3-bayar.uat.ts", "Rilis 3 [BAYAR]", satu.judul],
    tags: satu.tag ?? [],
    annotations: satu.catatan ?? [],
  } as unknown as TestCase;
  const hasil = {
    status: satu.hasil,
    duration: 4_000,
    steps: (satu.langkah ?? []).map((langkah) => ({
      category: "test.step",
      title: langkah.judul,
      steps: [],
      error: langkah.galat ? { message: langkah.galat } : undefined,
    })),
    error: satu.galat ? { message: satu.galat } : undefined,
  } as unknown as TestResult;
  return [uji, hasil];
}

/** One `npm run uat` invocation: the journeys that ran, then the summary the folder holds afterwards. */
function jalankan(folder: string, perjalanan: Perjalanan[], mulai = new Date("2026-10-04T03:00:00Z")): string {
  const pelapor = new RingkasanReporter({ out: folder, baseUrl: "https://dev.makam.co.id", sekarang: () => mulai });
  for (const satu of perjalanan) pelapor.onTestEnd(...selesai(satu));
  pelapor.onEnd({ status: "passed" } as FullResult);
  return readFileSync(path.join(folder, "ringkasan.md"), "utf8");
}

function folderBaru(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "uat-ringkasan-"));
  folders.push(dir);
  return dir;
}

describe("the UAT summary the owner reads", () => {
  it("shows the error of a failed step as plain text, without the terminal's colour codes", () => {
    const md = jalankan(folderBaru(), [
      {
        judul: "R2-59.1 Lokasi Ditangguhkan",
        hasil: "failed",
        langkah: [{ judul: "Admin Platform: Tangguhkan", galat: "\u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoBeVisible()" }],
      },
    ]);
    expect(md).toContain("expect(locator).toBeVisible()");
    expect(md).not.toContain("\u001b");
  });

  it("says why a journey did not run, apart from the ones that failed", () => {
    const md = jalankan(folderBaru(), [
      {
        judul: "R2-42.1 Perpanjangan di masa tenggang",
        tag: ["@rilis2", "@bayar"],
        hasil: "skipped",
        catatan: [{ type: "skip", description: "Isi UAT_HAK_PAKAI_MASA_TENGGANG: id Hak Pakai Kedaluwarsa dalam masa tenggang" }],
      },
      { judul: "R3-47.2 Penolakan PTSP", tag: ["@rilis3", "@bayar"], hasil: "skipped", catatan: [{ type: "fixme", description: "Belum diskrip" }] },
    ]);
    expect(md).toMatch(/## Tidak berjalan[\s\S]*R2-42\.1[\s\S]*Isi UAT_HAK_PAKAI_MASA_TENGGANG/);
    expect(md).toMatch(/R3-47\.2[\s\S]*Belum diskrip/);
    expect(md).not.toMatch(/## Gagal/);
  });

  it("does not let a run that did not reach every [BAYAR] journey look like the gate's 'all green'", () => {
    const md = jalankan(folderBaru(), [
      { judul: "R2-35.1 Tumpang", tag: ["@rilis2", "@bayar"], hasil: "passed" },
      { judul: "R2-42.1 Masa tenggang", tag: ["@rilis2", "@bayar"], hasil: "skipped", catatan: [{ type: "skip", description: "data belum diisi" }] },
      { judul: "R3-48.1 Perpanjangan TPU", tag: ["@rilis3", "@bayar"], hasil: "skipped", catatan: [{ type: "fixme", description: "belum diskrip" }] },
      { judul: "§1 Masuk", tag: ["@rilis1"], hasil: "passed" },
    ]);
    expect(md).toMatch(/\[BAYAR\] belum berjalan: 2 dari 3/);
  });

  it("says nothing about [BAYAR] journeys that did not run when every one of them ran and passed", () => {
    const md = jalankan(folderBaru(), [{ judul: "R2-35.1 Tumpang", tag: ["@rilis2", "@bayar"], hasil: "passed" }]);
    expect(md).not.toMatch(/belum berjalan/);
  });

  it("gives the start of the run in WIB, the owner's clock", () => {
    const md = jalankan(folderBaru(), [{ judul: "§1 Masuk", hasil: "passed" }], new Date("2026-10-04T03:00:00Z"));
    expect(md).toContain("04/10/2026 10.00.00 WIB");
    expect(md).not.toContain("2026-10-04T03:00");
  });

  it("keeps, on the same folder, what an earlier run proved and replaces it only for a journey that ran again", () => {
    const folder = folderBaru();
    jalankan(folder, [
      { judul: "§2 Terencana", hasil: "passed" },
      { judul: "§3 Pembayaran QRIS", hasil: "failed", galat: "checkout tidak terbuka" },
    ]);
    const md = jalankan(folder, [{ judul: "§3 Pembayaran QRIS", hasil: "passed" }], new Date("2026-10-04T05:00:00Z"));
    expect(md).toContain("§2 Terencana");
    expect(md).toContain("§3 Pembayaran QRIS");
    expect(md).toMatch(/Perjalanan: 2: 2 lulus, 0 gagal, 0 dilewati/);
    expect(md).not.toMatch(/## Gagal/);
  });

  it("lists the steps a person still has to check, under the journey that declared them", () => {
    const md = jalankan(folderBaru(), [
      { judul: "R3-45.1 Saat Duka TPU", hasil: "passed", catatan: [{ type: "manual", description: "Nama dan kontak tampil: dibaca owner" }] },
    ]);
    expect(md).toMatch(/## Perlu dicek manusia[\s\S]*R3-45\.1[\s\S]*Nama dan kontak tampil/);
  });
});
