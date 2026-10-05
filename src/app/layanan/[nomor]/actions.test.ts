/**
 * The Pemesan's Penilaian of a finished TPU job, as the Server Action answers it (AGENTS.md: authenticate, check the role,
 * validate with Zod, call the Layanan module; ticket 123). What a Penilaian means is the Layanan module's own tests
 * (`penilaian-tpu.test.ts`); this says the action reaches it for the signed-in Pemesan and nobody else, and speaks in words.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { penilaianMessages } from "@/lib/layanan-labels";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { mitraJasaUntuk, pekerjaanTpuSelesai, siapTpuBertarif } from "../../../../tests/support/layanan-tpu";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { beriPenilaianPekerjaanTpu } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db, close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const idle = { status: "idle" } as const;
function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("Beri penilaian on a TPU job (Server Action)", () => {
  it("needs a signed-in Pemesan, takes the Penilaian of their finished job once, and says in words what it refuses", async () => {
    const s = await siapTpuBertarif(db);
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await pekerjaanTpuSelesai(s, mitra);
    const isian = { pekerjaanId, nomor, bintang: "5", komentar: "Rapi sekali." };

    // No session yet: the page offers the form only to the Pemesan, so this is a stale tab, and it is told to sign in.
    expect(await beriPenilaianPekerjaanTpu(idle, form(isian))).toEqual({ status: "gagal", message: penilaianMessages.belum_masuk });

    const login = await server.logIn(s.pemesan.email);
    browser.store(login.session.cookies);
    // The stars are required (the form's radio buttons are, in the browser; here nothing is trusted from it).
    expect(await beriPenilaianPekerjaanTpu(idle, form({ ...isian, bintang: "" }))).toEqual({ status: "gagal", message: penilaianMessages.input_tidak_valid });
    expect(await beriPenilaianPekerjaanTpu(idle, form({ ...isian, bintang: "6" }))).toEqual({ status: "gagal", message: penilaianMessages.input_tidak_valid });

    expect(await beriPenilaianPekerjaanTpu(idle, form(isian))).toEqual({ status: "berhasil", message: "Terima kasih. Penilaian Anda sudah kami terima." });
    expect(await beriPenilaianPekerjaanTpu(idle, form({ ...isian, bintang: "1" }))).toEqual({ status: "gagal", message: penilaianMessages.sudah_dinilai });

    // The first one is the one kept, and Admin Platform reads it.
    expect(await s.setup.layanan.daftarPenilaian(s.admin)).toMatchObject([{ pekerjaanId, bintang: 5, komentar: "Rapi sekali." }]);
  });

  it("does not take a Penilaian of somebody else's job", async () => {
    const s = await siapTpuBertarif(db);
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await pekerjaanTpuSelesai(s, mitra);

    const login = await server.logIn("orang.lain@contoh.id");
    browser.store(login.session.cookies);

    expect(await beriPenilaianPekerjaanTpu(idle, form({ pekerjaanId, nomor, bintang: "1", komentar: "" }))).toEqual({
      status: "gagal",
      message: penilaianMessages.tidak_ditemukan,
    });
    expect(await s.setup.layanan.daftarPenilaian(s.admin)).toEqual([]);
  });
});
