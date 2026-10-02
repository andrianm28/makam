/**
 * "Makamkan di sini", Kirim (ticket 35): the wizard asks only for the Almarhum and the Pemesan, and like the
 * Saat Duka wizard (ticket 22) a visitor with no session is sent to the Kode Masuk step, whose correct code is the login.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { hakPakaiDenganPemegang } from "../../../../tests/support/tumpang";
import type { PemesananSetup } from "../../../../tests/support/pemesanan";
import { ajukanTumpangAction, verifikasiKodeMasukDanAjukanTumpang } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

async function fixture(pemegangEmail: string) {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as unknown as PemesananSetup;
  return hakPakaiDenganPemegang(setup, { name: "Siti Aminah", phoneNumber: "081200000001", email: pemegangEmail });
}

function draft(f: Awaited<ReturnType<typeof fixture>>, overrides: Record<string, unknown> = {}) {
  return {
    pemesanName: "Rina Wulandari",
    email: "pemegang@contoh.id",
    phoneNumber: "081234567890",
    almarhumName: "Budi Santoso",
    tanggalWafat: "2026-09-30",
    rencanaPemakamanAt: "",
    lokasiId: f.lokasi.lokasiMitra.id,
    hakPakaiId: f.hakPakaiId,
    jenis: "tumpang",
    ...overrides,
  };
}

describe("Kirim Makamkan di sini (Server Action)", () => {
  it("a visitor with no session is sent to the Kode Masuk step instead of being refused", async () => {
    const f = await fixture("pemegang@contoh.id");
    expect(await ajukanTumpangAction(draft(f))).toEqual({ status: "perlu_kode_masuk" });
  });

  it("a signed-in Pemesan who is the Pemegang Hak places the order with implicit consent, asking only for the Almarhum and the Pemesan", async () => {
    const f = await fixture("pemegang@contoh.id");
    const login = await server.logIn("pemegang@contoh.id");
    browser.store(login.session.cookies);

    const hasil = await ajukanTumpangAction(draft(f));
    expect(hasil).toMatchObject({ status: "selesai" });
    if (hasil.status !== "selesai") return;
    const staf = await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, hasil.nomor);
    expect(staf).toMatchObject({ kind: "tumpang", status: "diajukan", tumpang: { konsen: { state: "implisit" } } });
  });

  it("says which field to fix, and refuses an email that is not the signed-in Akun's", async () => {
    const f = await fixture("pemegang@contoh.id");
    const login = await server.logIn("pemegang@contoh.id");
    browser.store(login.session.cookies);

    expect(await ajukanTumpangAction(draft(f, { almarhumName: "  ", tanggalWafat: "30-09-2026" }))).toMatchObject({
      status: "gagal",
      pesan: { almarhumName: "Tulis nama almarhum / almarhumah.", tanggalWafat: "Tanggal wafat belum benar." },
    });
    expect(await ajukanTumpangAction(draft(f, { email: "orang.lain@contoh.id" }))).toEqual({
      status: "gagal",
      message: "Email ini bukan email akun Anda. Kirim ulang dengan email lain.",
    });
  });
});

describe("Kode Masuk at Kirim (Server Action)", () => {
  it("a wrong code stays on the screen with identity's own words and places nothing", async () => {
    const f = await fixture("pemegang@contoh.id");
    const hasil = await verifikasiKodeMasukDanAjukanTumpang(draft(f), { status: "idle" }, new FormData());
    expect(hasil).toEqual({ status: "gagal", message: "Masukkan 6 angka Kode Masuk dari email Anda." });
  });

  it("a correct code logs the Pemesan in and places the order in the same request, landing on the order page", async () => {
    const f = await fixture("pemegang@contoh.id");
    const { identity } = server.runtime();
    const sent = await identity.requestKodeMasuk({ email: "pemegang@contoh.id", ip: "203.0.113.9" });
    if (!sent.ok) throw new Error(sent.reason);
    const code = server.email().sent.filter((m) => m.to === sent.email).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
    const formData = new FormData();
    formData.set("email", "pemegang@contoh.id");
    formData.set("code", code!);

    await expect(verifikasiKodeMasukDanAjukanTumpang(draft(f), { status: "idle" }, formData)).rejects.toMatchObject({
      digest: expect.stringContaining("/pesanan/MKM-"),
    });
  });
});
