import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";

/*
 * The run's summary, next to the HTML report: `ringkasan.md` (for the owner and
 * the orchestrator) and `ringkasan.json` (for tooling). Every journey with its
 * result, each failure with its first error line, and the steps declared manual,
 * which a person still has to check.
 */

interface LangkahRingkas {
  judul: string;
  hasil: "lulus" | "gagal" | "manual";
  galat?: string;
}

interface BarisUji {
  judul: string;
  tag: string[];
  hasil: string;
  durasiDetik: number;
  langkah: LangkahRingkas[];
  galat?: string;
  manual: string[];
}

function ratakan(langkah: TestStep[], hasil: LangkahRingkas[] = []): LangkahRingkas[] {
  for (const satu of langkah) {
    if (satu.category === "test.step") {
      const manual = satu.title.startsWith("[MANUAL]");
      hasil.push({
        judul: satu.title,
        hasil: satu.error ? "gagal" : manual ? "manual" : "lulus",
        galat: satu.error?.message?.split("\n")[0],
      });
    }
    ratakan(satu.steps, hasil);
  }
  return hasil;
}

function bersihkan(teks: string): string {
  return teks.replace(/\u001b\[[0-9;]*m/g, "");
}

export default class RingkasanReporter implements Reporter {
  private readonly baris: BarisUji[] = [];
  private readonly mulai = new Date();

  constructor(private readonly opsi: { out: string; baseUrl?: string }) {}

  onTestEnd(test: TestCase, result: TestResult): void {
    this.baris.push({
      judul: test.titlePath().slice(2).join(" › "),
      tag: test.tags,
      hasil: result.status,
      durasiDetik: Math.round(result.duration / 1000),
      langkah: ratakan(result.steps),
      galat: result.error?.message ? bersihkan(result.error.message).split("\n")[0] : undefined,
      manual: test.annotations.filter((catatan) => catatan.type === "manual").map((catatan) => catatan.description ?? ""),
    });
  }

  onEnd(hasil: FullResult): void {
    const lulus = this.baris.filter((baris) => baris.hasil === "passed").length;
    const gagal = this.baris.filter((baris) => ["failed", "timedOut", "interrupted"].includes(baris.hasil)).length;
    const dilewati = this.baris.filter((baris) => baris.hasil === "skipped").length;
    const manual = this.baris.flatMap((baris) => baris.manual.map((butir) => ({ perjalanan: baris.judul, butir })));

    const md: string[] = [
      `# Ringkasan UAT`,
      ``,
      `- Alamat: ${this.opsi.baseUrl ?? process.env.UAT_BASE_URL ?? "?"}`,
      `- Mulai: ${this.mulai.toISOString()}; status akhir: ${hasil.status}`,
      `- Perjalanan: ${this.baris.length}: ${lulus} lulus, ${gagal} gagal, ${dilewati} dilewati`,
      `- Butir manual (dicek orang): ${manual.length}`,
      `- Bukti: \`${join(this.opsi.out, "bukti")}\`; laporan HTML: \`${join(this.opsi.out, "laporan", "index.html")}\``,
      ``,
      `| Perjalanan | Tag | Hasil | Detik | Langkah (lulus/gagal/manual) |`,
      `|---|---|---|---|---|`,
      ...this.baris.map((baris) => {
        const hitung = (jenis: string) => baris.langkah.filter((langkah) => langkah.hasil === jenis).length;
        return `| ${baris.judul} | ${baris.tag.join(" ")} | ${baris.hasil} | ${baris.durasiDetik} | ${hitung("lulus")}/${hitung("gagal")}/${hitung("manual")} |`;
      }),
    ];
    const gagalan = this.baris.filter((baris) => baris.langkah.some((langkah) => langkah.hasil === "gagal") || baris.galat);
    if (gagalan.length > 0) {
      md.push(``, `## Gagal`);
      for (const baris of gagalan) {
        md.push(``, `### ${baris.judul}`);
        for (const langkah of baris.langkah.filter((satu) => satu.hasil === "gagal")) md.push(`- ${langkah.judul}: ${langkah.galat ?? ""}`);
        if (baris.galat) md.push(`- Galat: ${baris.galat}`);
      }
    }
    if (manual.length > 0) {
      md.push(``, `## Perlu dicek manusia`, ``);
      for (const satu of manual) md.push(`- ${satu.perjalanan}: ${satu.butir}`);
    }

    mkdirSync(this.opsi.out, { recursive: true });
    writeFileSync(join(this.opsi.out, "ringkasan.md"), `${md.join("\n")}\n`);
    writeFileSync(join(this.opsi.out, "ringkasan.json"), JSON.stringify({ lulus, gagal, dilewati, manual, perjalanan: this.baris }, null, 2));
  }
}
