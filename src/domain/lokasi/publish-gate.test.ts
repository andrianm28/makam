import { describe, expect, it } from "vitest";
import { publishGate, type PublishGateFacts } from "@/domain/lokasi";

const everythingDone: PublishGateFacts = {
  agreement: { signedOn: "2026-09-12", scanUploaded: true },
  kunjunganVerifikasiSelesai: true,
  tariffsChecked: { changedSinceCheck: false },
  jamOperasionalDiisi: true,
  kontakSiagaDipilih: true,
};

const unmet = (facts: PublishGateFacts) =>
  publishGate(facts)
    .items.filter((item) => !item.met)
    .map((item) => item.key);

describe("the publish gate of a Lokasi Mitra", () => {
  it("lists the signed agreement, a completed Kunjungan Verifikasi, Tarif Diperiksa, a saved Jam Operasional and a Kontak Siaga, in that order", () => {
    expect(publishGate(everythingDone)).toEqual({
      ready: true,
      items: [
        { key: "perjanjian", met: true },
        { key: "kunjungan_verifikasi", met: true },
        { key: "tarif_diperiksa", met: true },
        { key: "jam_operasional", met: true },
        { key: "kontak_siaga", met: true },
      ],
    });
  });

  it("is not met by an agreement without its scan, or a scan without its signing date", () => {
    expect(unmet({ ...everythingDone, agreement: { signedOn: "2026-09-12", scanUploaded: false } })).toEqual(["perjanjian"]);
    expect(unmet({ ...everythingDone, agreement: { signedOn: null, scanUploaded: true } })).toEqual(["perjanjian"]);
  });

  it("counts Tarif Diperiksa only while no tariff changed since the check", () => {
    expect(publishGate({ ...everythingDone, tariffsChecked: null })).toMatchObject({
      ready: false,
      items: expect.arrayContaining([{ key: "tarif_diperiksa", met: false }]),
    });
    expect(publishGate({ ...everythingDone, tariffsChecked: { changedSinceCheck: true } })).toMatchObject({
      ready: false,
      items: expect.arrayContaining([{ key: "tarif_diperiksa", met: false, tarifBerubahSejakDiperiksa: true }]),
    });
  });

  it("is not ready while any one condition is missing", () => {
    expect(unmet({ ...everythingDone, kunjunganVerifikasiSelesai: false })).toEqual(["kunjungan_verifikasi"]);
    expect(unmet({ ...everythingDone, jamOperasionalDiisi: false })).toEqual(["jam_operasional"]);
    expect(unmet({ ...everythingDone, kontakSiagaDipilih: false })).toEqual(["kontak_siaga"]);
    expect(publishGate({ ...everythingDone, kontakSiagaDipilih: false }).ready).toBe(false);
  });
});
