import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const MODUL = join(__dirname, "konfirmasi-saat-duka-tpu.ts");

/** The kinds the confirmation's line builder is allowed to put on a Tagihan, read out of the module's own source. */
function kindsYangBisaDitagih(): string[] {
  const source = readFileSync(MODUL, "utf8");
  const found = source.match(/const KINDS_YANG_BISA_DITAGIH = \[([\s\S]*?)\] as const;/);
  if (!found?.[1]) throw new Error("KINDS_YANG_BISA_DITAGIH not found");
  return [...found[1].matchAll(/"([a-z_]+)"/g)].map((satu) => satu[1]!);
}

/** A confirmed order, read back through the module's own functions. */
async function konfirmasiTpu(setup: ReturnType<typeof queuesOnTestDatabase>) {
  const admin = await siapkanOperatorPemesanan(setup);
  const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pen_retribusi@contoh.id");
  setup.clock.set(wib("2026-10-01 10:00"));
  const fixture = await saatDukaTpuFixture(setup);
  setup.clock.set(wib("2026-10-01 10:00"));
  const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  if (!placed.ok) throw new Error("unreachable");
  const hasil = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
    nomor: "MKM-2026-000001",
    pemakamanAt: "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: petugas.accountId,
    catatan: "",
  });
  if (!hasil.ok) throw new Error(`konfirmasi refused: ${hasil.reason}`);
  return { admin, fixture, hasil };
}

describe("a Saat Duka TPU Tagihan never carries a Lokasi Mitra line", () => {
  it("charges only the Operator's Biaya Pengurusan and the town's Retribusi: never the Operator's platform fee", () => {
    // The permission is a compile-time constant, not runtime state, so the
    // thing that can be wrong is the constant itself. `spec.md:370`: the
    // Biaya Layanan Platform applies "per Tagihan where it applies (Lokasi Mitra
    // only)", and a TPU order is the Operator's own work at a town's cemetery.
    expect(kindsYangBisaDitagih()).toEqual(["biaya_pengurusan", "retribusi_pemda"]);
  });

  it("leaves the order with no plot and every line on no Lokasi Mitra, which is what makes a Pencairan impossible", async () => {
    const setup = queuesOnTestDatabase(db);
    const { fixture, hasil } = await konfirmasiTpu(setup);

    // The Operator's own platform fee is entered at 150.001 by the fixture and
    // is on no line: the total is the Biaya Pengurusan alone, the Retribusi being
    // Rp 0 (every Retribusi is, so v1 builds the structure only).
    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order?.harga).toEqual([
      { kind: "biaya_pengurusan", label: "Biaya Pengurusan", amount: 1_750_000 },
      { kind: "retribusi_pemda", label: "Retribusi Pemda (IPTM)", amount: 0 },
    ]);
    expect(hasil.tagihan.total).toBe(1_750_000);

    // Every trigger a Pencairan is drawn on is keyed on a Lokasi Mitra, a Mitra
    // Jasa or a Petak Makam (`spec.md:493-501`): "Saat Duka Petak and a later
    // burial's Biaya Pemakaman", "Terencana Hak Pakai", "Perpanjangan",
    // "Layanan (Lokasi Mitra or Mitra Jasa)". A TPU order has no plot and no
    // partner on any line, so there is nothing for a Pencairan to be drawn on.
    const tagihan = await setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan?.lines).toEqual([
      { kind: "biaya_pengurusan", label: "Biaya Pengurusan", amount: 1_750_000, provider: { kind: "operator" } },
      { kind: "retribusi_pemda", label: "Retribusi Pemda (IPTM)", amount: 0, provider: { kind: "pemda" } },
    ]);
    expect(tagihan?.lines.some((line) => line.provider.kind === "lokasi_mitra")).toBe(false);
    // A plot is what the Saat Duka Pencairan is keyed on, and there is no plot
    // at a TPU: the TPU itself lays the grave out.
    expect("petakId" in order!).toBe(false);
    expect("hakPakaiId" in order!).toBe(false);
  });
});
