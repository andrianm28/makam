/**
 * The wizard's Kirim, as the Server Actions answer it (AGENTS.md: authenticate,
 * check the role, validate with Zod, call the Pemesanan module). What the
 * placement itself means is the Pemesanan module's own tests.
 *
 * The TPU form's Kirim refuses a Tumpang whose family has not ticked that it
 * understands the tumpang conditions (ticket 123, owner rule C3, 2026-10-05):
 * a Server Action is a public endpoint, so the disabled button is not the only
 * gate.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { cellsOf } from "../../../../tests/support/inventory";
import { saatDukaFixture, siapkanOperatorPemesanan, tawarkanLayananDi } from "../../../../tests/support/pemesanan";
import { saatDukaTpuFixture, type PengurusanSetup } from "../../../../tests/support/pengurusan";
import { toBase64 } from "@/lib/files/base64";
import { kirimPengurusanTpu, kirimPesanan, verifikasiKodeMasukDanKirimTpu } from "./actions";
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

describe("Kirim pesanan with hari-H Layanan (ticket 53)", () => {
  it("a signed-in Pemesan's hari-H Layanan reach the Pemesanan Saat Duka, and are on its Tagihan and Dijadwalkan when the Lokasi confirms", async () => {
    const rt = server.runtime();
    const setup = { ...rt, clock: server.clock, email: server.email() } as unknown as Parameters<typeof saatDukaFixture>[0];
    const fixture = await saatDukaFixture(setup);
    const { varian } = await tawarkanLayananDi(setup as never, fixture.lokasiMitra.id);
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    const hasil = await kirimPesanan(
      draft({ lokasiId: fixture.lokasiMitra.id, jenisMakamId: fixture.jenisMakam.id, rencanaPemakamanAt: "2026-10-02T10:00", layananHariH: [{ layananVariantId: varian.id, teks: null }] }),
    );
    expect(hasil.status).toBe("selesai");
    if (hasil.status !== "selesai") return;

    const [blok] = await rt.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const petak = (await cellsOf(setup as never, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).find((cell) => cell.kind === "petak")!;
    await siapkanOperatorPemesanan(setup as never);
    const konfirmasi = await rt.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, { nomor: hasil.nomor, petakId: petak.id, pemakamanAt: "2026-10-02T10:00" });
    expect(konfirmasi.ok).toBe(true);
    const pesanan = await rt.layanan.pesananLayananOf(hasil.nomor, fixture.pemesan);
    expect(pesanan?.item).toMatchObject([{ targetDate: "2026-10-02", pekerjaan: { status: "dijadwalkan" } }]);
  });
});

/** The words a family is refused a Tumpang with when it has not ticked the box (stated here, from the ticket, not read back from the code). */
const PESAN_PERSETUJUAN = "Centang dulu persetujuan syarat Tumpang (aturan 3 tahun dan surat persetujuan Pemegang Hak) sebelum mengirim.";

/** The TPU form's draft for a new grave, as "Data & kirim" of a TPU would have it filled in. */
function draftTpu(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pemesanName: "Budi Santoso",
    email: "pemesan@contoh.id",
    phoneNumber: "081234567890",
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-30",
    tpuId: "00000000-0000-4000-8000-000000000003",
    jenis: "baru",
    kelayakan: { ktpDki: true, wafatDiJakarta: true },
    kuburan: null,
    fotoIptm: null,
    pemegangHak: { mode: "pemesan" },
    layananHariH: [],
    ...overrides,
  };
}

/** What a Tumpang carries besides the consent: the grave described and its IPTM photographed. */
const TUMPANG = {
  jenis: "tumpang",
  kuburan: { blokNomor: "Blok B-12 No. 34", nama: "Hasan Basri" },
  fotoIptm: { nama: "iptm.jpg", contentType: "image/jpeg", isi: toBase64(new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3])) },
};

describe("Kirim pengurusan TPU (Server Action): the Tumpang consent", () => {
  it("refuses a Tumpang whose family has not confirmed the tumpang conditions, saying so under the checkbox", async () => {
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);
    const refused = { status: "gagal", pesan: { persetujuanTumpang: PESAN_PERSETUJUAN }, message: PESAN_PERSETUJUAN };

    expect(await kirimPengurusanTpu(draftTpu({ ...TUMPANG, persetujuanTumpang: false }))).toEqual(refused);
    // A request that does not carry the consent at all (a stale tab, or a hand-made one) is a request without it.
    expect(await kirimPengurusanTpu(draftTpu(TUMPANG))).toEqual(refused);
  });

  it("refuses it at the Kode Masuk step too, before the code is read or any Akun is made", async () => {
    const data = new FormData();
    data.set("email", "pemesan@contoh.id");
    data.set("code", "123456");

    expect(await verifikasiKodeMasukDanKirimTpu(draftTpu({ ...TUMPANG, persetujuanTumpang: false }), { status: "idle" }, data)).toMatchObject({
      status: "gagal",
      message: PESAN_PERSETUJUAN,
    });
  });

  it("places a Tumpang once the box is ticked, and a new grave never needed it", async () => {
    const rt = server.runtime();
    const setup = { ...rt, clock: server.clock, email: server.email() } as unknown as PengurusanSetup;
    const { tpuDki } = await saatDukaTpuFixture(setup);
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    expect(await kirimPengurusanTpu(draftTpu({ ...TUMPANG, tpuId: tpuDki.id, persetujuanTumpang: true }))).toMatchObject({ status: "selesai" });
    expect(await kirimPengurusanTpu(draftTpu({ tpuId: tpuDki.id }))).toMatchObject({ status: "selesai" });
  });
});
