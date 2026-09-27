/**
 * The wizard's Kirim, as the Server Actions answer it (AGENTS.md: authenticate,
 * check the role, validate with Zod, call the Pemesanan module). What the
 * placement itself means is the Pemesanan module's own tests.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { kirimPesanan } from "./actions";
import type { DraftSaatDuka } from "./draft";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** The wizard's draft, as "Data & kirim" would have it filled in. */
function draft(overrides: Partial<DraftSaatDuka> = {}): Record<string, unknown> {
  return {
    pemesanName: "Budi Santoso",
    email: "pemesan@contoh.id",
    phoneNumber: "081234567890",
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-30",
    rencanaPemakamanAt: "",
    keinginanPenempatan: "",
    pemegangHak: { mode: "pemesan" },
    lokasiId: "00000000-0000-4000-8000-000000000001",
    jenisMakamId: "00000000-0000-4000-8000-000000000002",
    ...overrides,
  };
}

describe("Kirim pesanan (Server Action)", () => {
  it("a visitor with no session is sent to the Kode Masuk step instead of being refused", async () => {
    expect(await kirimPesanan(draft())).toEqual({ status: "perlu_kode_masuk" });
  });

  it("says which field to fix, so each message lands under the field that caused it", async () => {
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    const hasil = await kirimPesanan(
      draft({ pemesanName: "  ", email: "bukan-email", tanggalWafat: "30-09-2026", rencanaPemakamanAt: "besok pagi" }),
    );

    expect(hasil).toEqual({
      status: "gagal",
      pesan: {
        pemesanName: "Tulis nama lengkap Anda.",
        email: "Alamat email tidak valid. Contoh: nama@contoh.id.",
        tanggalWafat: "Tanggal wafat belum benar.",
        rencanaPemakamanAt: "Waktu pemakaman yang direncanakan belum benar.",
      },
      message: "Tulis nama lengkap Anda.",
    });
  });

  it("refuses an email that is not the signed-in Akun's, instead of quietly using the session's", async () => {
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    const hasil = await kirimPesanan(draft({ email: "orang.lain@contoh.id" }));

    expect(hasil).toEqual({ status: "gagal", message: "Email ini bukan email akun Anda. Kirim ulang dengan email lain." });
  });
});
