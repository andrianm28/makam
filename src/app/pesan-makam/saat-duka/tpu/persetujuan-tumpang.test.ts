/**
 * The consent a Tumpang asks of the family on the Saat Duka TPU form (ticket 123, owner rule C3, 2026-10-05), rendered: a
 * required checkbox that names the conditions (the IPTM in force, the 3-year rule, the Pemegang Hak's letter), and a Kirim that
 * stays disabled for a Tumpang until it is ticked. A new grave never asks for it, and a Kirim in flight or a family a TPU
 * cannot serve stays locked whatever the box says.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersetujuanTumpang, TombolKirimTpu } from "./persetujuan-tumpang";

const tanpaAksi = () => {};

/** How a locked button reads in markup: the attribute itself, as the button's own classes also say "disabled:" for how it looks. */
const DIKUNCI = 'disabled=""';

function kotak(over: Partial<Parameters<typeof PersetujuanTumpang>[0]> = {}): string {
  return renderToStaticMarkup(createElement(PersetujuanTumpang, { setuju: false, onUbah: tanpaAksi, ...over }));
}

function kirim(over: Partial<Parameters<typeof TombolKirimTpu>[0]> = {}): string {
  return renderToStaticMarkup(createElement(TombolKirimTpu, { mengirim: false, tidakLayak: false, jenis: "tumpang", setuju: false, onKlik: tanpaAksi, ...over }));
}

describe("the Tumpang consent checkbox", () => {
  it("is a required box, not ticked at first, that names the 3-year rule and the Pemegang Hak's letter", () => {
    const markup = kotak();

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("required");
    expect(markup).not.toContain("checked");
    expect(markup).toContain("IPTM");
    expect(markup).toContain("3 tahun");
    expect(markup).toContain("persetujuan tertulis Pemegang Hak");
  });

  it("is ticked once the family has ticked it", () => {
    expect(kotak({ setuju: true })).toContain("checked");
  });

  it("says what is wrong right under the box when Kirim was refused for it", () => {
    const markup = kotak({ error: "Centang dulu persetujuan syarat Tumpang (aturan 3 tahun dan surat persetujuan Pemegang Hak) sebelum mengirim." });

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Centang dulu persetujuan syarat Tumpang");
    expect(markup).toContain('aria-invalid="true"');
  });
});

describe("Kirim pengurusan on the TPU form", () => {
  it("stays disabled for a Tumpang until the box is ticked, and says why", () => {
    const markup = kirim({ jenis: "tumpang", setuju: false });

    expect(markup).toContain(DIKUNCI);
    expect(markup).toContain("Centang persetujuan syarat Tumpang");
  });

  it("is enabled for a Tumpang once the box is ticked", () => {
    const markup = kirim({ jenis: "tumpang", setuju: true });

    expect(markup).not.toContain(DIKUNCI);
    expect(markup).not.toContain("Centang persetujuan syarat Tumpang");
    expect(markup).toContain("Kirim pengurusan");
  });

  it("never waits for the box for a new grave", () => {
    const markup = kirim({ jenis: "baru", setuju: false });

    expect(markup).not.toContain(DIKUNCI);
    expect(markup).not.toContain("Centang persetujuan syarat Tumpang");
  });

  it("stays locked while it is sending and for a family a TPU cannot serve, whatever the box says", () => {
    expect(kirim({ jenis: "baru", mengirim: true })).toContain(DIKUNCI);
    expect(kirim({ jenis: "tumpang", setuju: true, mengirim: true })).toContain(DIKUNCI);
    expect(kirim({ jenis: "baru", tidakLayak: true })).toContain(DIKUNCI);
  });
});
