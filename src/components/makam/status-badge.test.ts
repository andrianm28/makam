import { describe, expect, it } from "vitest";
import { statusVocabulary } from "./status-badge";

/** The status vocabulary (spec, Staff UI and design system; docs/design-system.md). */
describe("the status vocabulary", () => {
  it("labels each status in CONTEXT.md words", () => {
    expect(Object.values(statusVocabulary).map((status) => status.label)).toEqual([
      "Belum Tayang",
      "Terverifikasi",
      "Aktif",
      "Ditangguhkan",
      "Berhenti",
      "Terlambat",
      "Lunas",
      "Belum Dibayar",
      "Menunggu Pembayaran",
      "Dijadwalkan",
      "Sedang Dikerjakan",
      "Keluhan",
      "Diajukan",
      "Dikonfirmasi",
      "Aktif",
      "Dimakamkan",
      "Selesai",
      "Ditolak",
      "Dibatalkan",
    ]);
  });

  it("keeps red for what needs action now: only Terlambat is danger", () => {
    const danger = Object.values(statusVocabulary).filter((status) => status.tone === "danger");
    expect(danger.map((status) => status.label)).toEqual(["Terlambat"]);
  });

  it("shows Berhenti as neutral grey (ended, not an emergency), like Belum Tayang", () => {
    expect(statusVocabulary.berhenti.tone).toBe("neutral");
    expect(statusVocabulary.belum_tayang.tone).toBe("neutral");
  });

  it("shows Dikonfirmasi green like Lunas and Terverifikasi", () => {
    expect([statusVocabulary.dikonfirmasi.tone, statusVocabulary.lunas.tone, statusVocabulary.terverifikasi.tone]).toEqual([
      "success",
      "success",
      "success",
    ]);
  });

  it("shows Belum Dibayar and Ditangguhkan amber, and Diajukan as waiting on someone else", () => {
    expect(statusVocabulary.belum_dibayar.tone).toBe("warning");
    expect(statusVocabulary.ditangguhkan.tone).toBe("warning");
    expect(statusVocabulary.diajukan.tone).toBe("info");
  });

  it("shows a Ditolak order as needing a decision, and a Dibatalkan one as ended for good", () => {
    expect(statusVocabulary.ditolak.tone).toBe("warning");
    expect(statusVocabulary.dibatalkan.tone).toBe("neutral");
  });
});
