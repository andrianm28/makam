import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { z } from "zod";
import { formatWib } from "../../src/lib/time/jakarta";

/*
 * The run's summary, next to the HTML report: `ringkasan.md` (for the owner and
 * the orchestrator) and `ringkasan.json` (for tooling). Every journey with its
 * result, each failure with its first error line, what did not run and why, and
 * the steps declared manual, which a person still has to check.
 *
 * A run is often resumed on the same folder (the hour's limit on Kode Masuk
 * requests splits it), so the summary is cumulative: a journey that ran again
 * replaces its earlier row, one that did not keeps it with the time it ran. Gate G2
 * reads "all [BAYAR] journeys green, 0 failed", so what did not run is named, never
 * folded into a pass.
 */

const langkahSchema = z.object({ judul: z.string(), hasil: z.enum(["lulus", "gagal", "manual"]), galat: z.string().optional() });
const barisSchema = z.object({
  judul: z.string(),
  tag: z.array(z.string()),
  hasil: z.string(),
  durasiDetik: z.number(),
  langkah: z.array(langkahSchema),
  galat: z.string().optional(),
  manual: z.array(z.string()),
  /** Why a skipped journey did not run: `skip: <reason>` (data or setup missing) or `fixme: <reason>` (not scripted). */
  alasanTidakBerjalan: z.string().optional(),
  /** The instant of the invocation that produced this row. */
  dijalankan: z.string(),
});
const berkasSchema = z.object({ perjalanan: z.array(barisSchema) });

type LangkahRingkas = z.infer<typeof langkahSchema>;
type BarisUji = z.infer<typeof barisSchema>;

function bersihkan(teks: string): string {
  return teks.replace(/\u001b\[[0-9;]*m/g, "");
}

function ratakan(langkah: TestStep[], hasil: LangkahRingkas[] = []): LangkahRingkas[] {
  for (const satu of langkah) {
    if (satu.category === "test.step") {
      const manual = satu.title.startsWith("[MANUAL]");
      hasil.push({
        judul: satu.title,
        hasil: satu.error ? "gagal" : manual ? "manual" : "lulus",
        galat: satu.error?.message ? bersihkan(satu.error.message).split("\n")[0] : undefined,
      });
    }
    ratakan(satu.steps, hasil);
  }
  return hasil;
}

function alasanTidakBerjalan(uji: TestCase, hasil: TestResult): string | undefined {
  if (hasil.status !== "skipped") return undefined;
  const catatan = uji.annotations.find((satu) => satu.type === "skip" || satu.type === "fixme");
  return catatan ? `${catatan.type}: ${catatan.description ?? "tanpa keterangan"}` : "skip: tanpa alasan tercatat";
}

/** Earlier rows stay unless the journey ran again; a journey seen for the first time is added at the end. */
function gabungkan(lama: BarisUji[], baru: BarisUji[]): BarisUji[] {
  const hasil = [...lama];
  for (const satu of baru) {
    const indeks = hasil.findIndex((ada) => ada.judul === satu.judul);
    if (indeks >= 0) hasil[indeks] = satu;
    else hasil.push(satu);
  }
  return hasil;
}

function bacaBarisLama(berkas: string): BarisUji[] {
  if (!existsSync(berkas)) return [];
  try {
    const isi = berkasSchema.safeParse(JSON.parse(readFileSync(berkas, "utf8")));
    return isi.success ? isi.data.perjalanan : [];
  } catch {
    return [];
  }
}

const GAGAL = ["failed", "timedOut", "interrupted"];

export default class RingkasanReporter implements Reporter {
  private readonly baru: BarisUji[] = [];
  private readonly mulai: Date;

  constructor(
    private readonly opsi: {
      out: string;
      baseUrl?: string;
      /** The folder of this invocation's HTML report, inside `out`. */
      laporan?: string;
      sekarang?: () => Date;
    },
  ) {
    this.mulai = (opsi.sekarang ?? (() => new Date()))();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.baru.push({
      judul: test.titlePath().slice(2).join(" › "),
      tag: test.tags,
      hasil: result.status,
      durasiDetik: Math.round(result.duration / 1000),
      langkah: ratakan(result.steps),
      galat: result.error?.message ? bersihkan(result.error.message).split("\n")[0] : undefined,
      manual: test.annotations.filter((catatan) => catatan.type === "manual").map((catatan) => catatan.description ?? ""),
      alasanTidakBerjalan: alasanTidakBerjalan(test, result),
      dijalankan: this.mulai.toISOString(),
    });
  }

  onEnd(hasil: FullResult): void {
    const berkasJson = join(this.opsi.out, "ringkasan.json");
    const baris = gabungkan(bacaBarisLama(berkasJson), this.baru);
    const lulus = baris.filter((satu) => satu.hasil === "passed").length;
    const gagal = baris.filter((satu) => GAGAL.includes(satu.hasil)).length;
    const dilewati = baris.filter((satu) => satu.hasil === "skipped").length;
    const manual = baris.flatMap((satu) => satu.manual.map((butir) => ({ perjalanan: satu.judul, butir })));
    const bayar = baris.filter((satu) => satu.tag.includes("@bayar"));
    const bayarTidakBerjalan = bayar.filter((satu) => satu.hasil === "skipped");

    const md: string[] = [
      `# Ringkasan UAT`,
      ``,
      `- Alamat: ${this.opsi.baseUrl ?? process.env.UAT_BASE_URL ?? "?"}`,
      `- Terakhir dijalankan: ${formatWib(this.mulai)}; status akhir: ${hasil.status}`,
      `- Perjalanan: ${baris.length}: ${lulus} lulus, ${gagal} gagal, ${dilewati} dilewati`,
      ...(bayarTidakBerjalan.length > 0
        ? [`- [BAYAR] belum berjalan: ${bayarTidakBerjalan.length} dari ${bayar.length} (gerbang G2 butuh semuanya lulus; "0 gagal" belum cukup)`]
        : []),
      `- Butir manual (dicek orang): ${manual.length}`,
      `- Bukti: \`${join(this.opsi.out, "bukti")}\`; laporan HTML run ini: \`${join(this.opsi.out, this.opsi.laporan ?? "laporan", "index.html")}\``,
      ``,
      `| Perjalanan | Tag | Hasil | Detik | Dijalankan | Langkah (lulus/gagal/manual) |`,
      `|---|---|---|---|---|---|`,
      ...baris.map((satu) => {
        const hitung = (jenis: string) => satu.langkah.filter((langkah) => langkah.hasil === jenis).length;
        return `| ${satu.judul} | ${satu.tag.join(" ")} | ${satu.hasil} | ${satu.durasiDetik} | ${formatWib(new Date(satu.dijalankan))} | ${hitung("lulus")}/${hitung("gagal")}/${hitung("manual")} |`;
      }),
    ];
    const gagalan = baris.filter((satu) => satu.langkah.some((langkah) => langkah.hasil === "gagal") || (satu.galat && satu.hasil !== "passed"));
    if (gagalan.length > 0) {
      md.push(``, `## Gagal`);
      for (const satu of gagalan) {
        md.push(``, `### ${satu.judul}`);
        for (const langkah of satu.langkah.filter((butir) => butir.hasil === "gagal")) md.push(`- ${langkah.judul}: ${langkah.galat ?? ""}`);
        if (satu.galat) md.push(`- Galat: ${satu.galat}`);
      }
    }
    const tidakBerjalan = baris.filter((satu) => satu.hasil === "skipped");
    if (tidakBerjalan.length > 0) {
      md.push(``, `## Tidak berjalan`, ``);
      for (const satu of tidakBerjalan) md.push(`- ${satu.judul}${satu.tag.includes("@bayar") ? " [BAYAR]" : ""}: ${satu.alasanTidakBerjalan ?? "skip: tanpa alasan tercatat"}`);
    }
    if (manual.length > 0) {
      md.push(``, `## Perlu dicek manusia`, ``);
      for (const satu of manual) md.push(`- ${satu.perjalanan}: ${satu.butir}`);
    }

    mkdirSync(this.opsi.out, { recursive: true });
    writeFileSync(join(this.opsi.out, "ringkasan.md"), `${md.join("\n")}\n`);
    writeFileSync(berkasJson, JSON.stringify({ lulus, gagal, dilewati, manual, perjalanan: baris }, null, 2));
  }
}
