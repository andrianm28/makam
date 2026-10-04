import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Most of the app's submit buttons turn into "Menyimpan…", "Mencatat…" or "Mengunggah…" while their Server Action runs. A journey
 * that clicks one and, on the next statement, waits for "the button is gone" proves nothing: the renamed button no longer answers
 * to its name, so the count of 0 holds at once, whether the action then succeeds or is refused. Such a submit goes through
 * `kirimLaluMuatUlang` (uat/support/halaman.ts): it waits for the action's answer, looks for a refusal in the form it submitted and
 * reloads, and the "gone" read follows it.
 *
 * What a journey may still click and wait on straight away is a button the app does not rename: it is only disabled while the
 * action runs, so the pending state keeps its count at 1. Each is named below with the file that draws it, which the test reads.
 */

/**
 * The name of each button a journey clicks and, on the next statement, expects to be gone (`toHaveCount(0)`): a line
 * `await <locator>.click();` followed, comments and blank lines aside, by `await expect(<the same locator>…).toHaveCount(0…)`.
 * A locator kept in a `const` is read through its declaration. A click on anything but a button found by its role is not one
 * of these: a test id does not change while the action runs.
 */
function tombolKlikLaluHilang(teks: string): string[] {
  const NAMA = String.raw`getByRole\("button",\s*\{\s*name:\s*"([^"]+)"`;
  const namaTombol = (lokator: string): string | undefined => {
    const langsung = new RegExp(NAMA).exec(lokator)?.[1];
    if (langsung || !/^\w+$/.test(lokator)) return langsung;
    return new RegExp(String.raw`const ${lokator} = [^;]*${NAMA}`).exec(teks)?.[1];
  };
  const baris = teks.split("\n");
  const hasil: string[] = [];
  baris.forEach((isi, indeks) => {
    const lokator = /^\s*await (.+?)(?:\.first\(\))?\.click\(\);\s*$/.exec(isi)?.[1];
    if (!lokator) return;
    const berikut = baris.slice(indeks + 1).find((satu) => satu.trim() !== "" && !satu.trim().startsWith("//"));
    if (!berikut || !/^\s*await expect\(/.test(berikut) || !/\.toHaveCount\(0\b/.test(berikut) || !berikut.includes(lokator)) return;
    const nama = namaTombol(lokator);
    if (nama) hasil.push(nama);
  });
  return hasil;
}

/** Buttons the app does not rename while their action runs (disabled only), with the file that draws each. */
const TIDAK_DIGANTI_NAMA: Record<string, string> = {
  // The Mitra Jasa's answer to an assignment: two buttons with a fixed label.
  Terima: "src/app/staf/mitra-jasa/pekerjaan/jawab-form.tsx",
  // The Pemegang Hak's answer to a Persetujuan pemakaman.
  Tolak: "src/app/(site)/akun/persetujuan/[nomor]/konsen-form.tsx",
};

describe("a click on a button the app renames while its action runs", () => {
  it("is found when a journey waits for that button's count to be 0 on the next statement", () => {
    const kode = `
      await admin.getByRole("button", { name: "Dokumen lengkap" }).click();
      await expect(admin.getByRole("button", { name: "Dokumen lengkap" })).toHaveCount(0, { timeout: 30_000 });
    `;
    expect(tombolKlikLaluHilang(kode)).toEqual(["Dokumen lengkap"]);
  });

  it("is found through a button kept in a variable, a .first(), a comment and a message on the wait", () => {
    const kode = `
      const tombol = admin.getByRole("button", { name: "IPTM diajukan" });
      await tombol.click();
      await expect(tombol).toHaveCount(0, { timeout: 30_000 });
      await mitra.getByRole("button", { name: "Terima", exact: true }).first().click();
      // The card goes once the job is accepted.
      await expect(mitra.getByRole("button", { name: "Terima", exact: true }), "tidak diterima").toHaveCount(0);
    `;
    expect(tombolKlikLaluHilang(kode)).toEqual(["IPTM diajukan", "Terima"]);
  });

  it("is not found in a submit that goes through kirimLaluMuatUlang, which reads the answer before the count", () => {
    const kode = `
      await kirimLaluMuatUlang(admin, admin.getByRole("button", { name: "Dokumen lengkap" }));
      await expect(admin.getByRole("button", { name: "Dokumen lengkap" }), "Dokumen lengkap tidak tercatat").toHaveCount(0);
    `;
    expect(tombolKlikLaluHilang(kode)).toEqual([]);
  });

  it("is not found for a button of another name than the one waited on, nor for a test id", () => {
    const kode = `
      await admin.getByRole("button", { name: "Simpan" }).click();
      await expect(admin.getByRole("button", { name: "Batal" })).toHaveCount(0);
      await admin.getByTestId("konfirmasi-terencana").click();
      await expect(admin.getByTestId("konfirmasi-terencana")).toHaveCount(0, { timeout: 30_000 });
    `;
    expect(tombolKlikLaluHilang(kode)).toEqual([]);
  });
});

const akar = process.cwd();
const berkasRunner = [
  ...readdirSync(path.join(akar, "uat/perjalanan")).filter((nama) => nama.endsWith(".uat.ts")).map((nama) => path.join("uat/perjalanan", nama)),
  ...readdirSync(path.join(akar, "uat/support")).filter((nama) => nama.endsWith(".ts")).map((nama) => path.join("uat/support", nama)),
];

describe("the journeys and helpers of the runner", () => {
  it("are read (a guard that finds nothing guards nothing)", () => {
    expect(berkasRunner.length).toBeGreaterThanOrEqual(25);
  });

  it.each(berkasRunner)("%s never waits for a renamed button to be gone straight after its click: it submits through kirimLaluMuatUlang", (berkas) => {
    const dipakai = tombolKlikLaluHilang(readFileSync(path.join(akar, berkas), "utf8")).filter((nama) => !(nama in TIDAK_DIGANTI_NAMA));
    expect(dipakai, "tombol yang dinamai ulang aplikasi saat aksinya berjalan: kirim lewat kirimLaluMuatUlang lalu baca hilangnya sesudah muat ulang").toEqual([]);
  });

  it.each(Object.entries(TIDAK_DIGANTI_NAMA))("%s keeps its name while its action runs, so a count of 0 after its click still means the card went", (nama, sumber) => {
    const teks = readFileSync(path.join(akar, sumber), "utf8");
    expect(teks, `${sumber} tidak lagi memuat tombol "${nama}" sebagai teks tetap`).toMatch(new RegExp(String.raw`>\s*${nama}\s*</`));
    expect(teks, `${sumber} menamai ulang "${nama}" saat aksinya berjalan: ubah situs-nya ke kirimLaluMuatUlang dan hapus dari TIDAK_DIGANTI_NAMA`).not.toMatch(
      new RegExp(String.raw`\?\s*"[^"]*"\s*:\s*"${nama}"`),
    );
  });
});
