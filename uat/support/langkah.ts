import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { keluaranDir } from "./keadaan";

/*
 * A step of a journey: a named `test.step` that takes a screenshot of the page
 * when it ends, passed or failed, saves it under `$UAT_OUT/bukti/<journey>/` and
 * attaches it to the HTML report. A step the runner cannot do (a message on the
 * owner's phone, a dashboard it has no login to) is declared with `manual`, so the
 * summary lists it for a person to check instead of silently leaving it out.
 */

const nomorLangkah = new Map<string, number>();

function irisan(teks: string): string {
  return (
    teks
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "langkah"
  );
}

async function potret(page: Page | null, judul: string): Promise<void> {
  if (!page || page.isClosed()) return;
  const info = test.info();
  const nomor = (nomorLangkah.get(info.testId) ?? 0) + 1;
  nomorLangkah.set(info.testId, nomor);
  const nama = `${String(nomor).padStart(2, "0")}-${irisan(judul)}`;
  try {
    const gambar = await page.screenshot({ fullPage: true, timeout: 15_000 });
    const folder = join(keluaranDir(), "bukti", irisan(info.titlePath.slice(1).join(" ")));
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${nama}.png`), gambar);
    await info.attach(nama, { body: gambar, contentType: "image/png" });
  } catch {
    // A page that is gone or still loading must not hide the step's own result.
  }
}

/** Runs `isi` as one step and screenshots `page` when it ends, whether it passed or threw. */
export async function langkah<T>(page: Page | null, judul: string, isi: () => Promise<T>): Promise<T> {
  return test.step(judul, async () => {
    try {
      return await isi();
    } finally {
      await potret(page, judul);
    }
  });
}

/** A step for a person to check: it is in the summary's "perlu dicek manusia" list, with a screenshot of where to look. */
export async function manual(page: Page | null, judul: string, keterangan: string): Promise<void> {
  await test.step(`[MANUAL] ${judul}`, async () => {
    test.info().annotations.push({ type: "manual", description: `${judul}: ${keterangan}` });
    await potret(page, `manual ${judul}`);
  });
}
