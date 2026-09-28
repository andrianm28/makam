import { describe, expect, it } from "vitest";
import { tagihanPerluDibayar } from "./index";

/**
 * Which Tagihan status still needs the family's money (Akun Saya's Perlu
 * Tindakan strip, ticket 27): the same classification `reissueTagihan` uses to
 * decide whether a Tagihan can still be cancelled and replaced — see
 * `TAGIHAN_PERLU_DIBAYAR`'s own comment in `tagihan.ts` for why the two are one
 * fact, not two.
 */
describe("whether a Tagihan status still needs the family's money", () => {
  it("Belum Dibayar and Lewat Jatuh Tempo need payment", () => {
    expect(tagihanPerluDibayar("belum_dibayar")).toBe(true);
    expect(tagihanPerluDibayar("lewat_jatuh_tempo")).toBe(true);
  });

  it("Lunas needs nothing more — it is already paid", () => {
    expect(tagihanPerluDibayar("lunas")).toBe(false);
  });

  it("Tidak Tertagih needs no more nagging — the Operator has already given up chasing it (CONTEXT.md)", () => {
    expect(tagihanPerluDibayar("tidak_tertagih")).toBe(false);
  });

  it("a cancelled or refunded Tagihan owes nothing: Dibatalkan, Dikembalikan Sebagian, Dikembalikan Penuh", () => {
    expect(tagihanPerluDibayar("dibatalkan")).toBe(false);
    expect(tagihanPerluDibayar("dikembalikan_sebagian")).toBe(false);
    expect(tagihanPerluDibayar("dikembalikan_penuh")).toBe(false);
  });
});
