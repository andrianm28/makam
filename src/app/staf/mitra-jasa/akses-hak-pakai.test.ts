/**
 * A Mitra Jasa never reaches a Hak Pakai (ticket 55's AC 6, the half its review found unproven; go-live: "required before
 * a real Mitra Jasa"). A Mitra Jasa is staff with a session, so the refusal is proved where it happens: the modules' reads
 * and writes as that actor, the Hak Pakai screen's Server Actions through the real session cookie, and the pages that show
 * a Hak Pakai rendered as that session. A read that answers is a breach whether or not a page shows it.
 *
 * Each refusal is checked against an Admin Lokasi who does see the same Hak Pakai, so it is about the role and not about
 * there being nothing there.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform, signInAsMitraJasa } from "../../../../tests/support/server-sign-in";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

const { akhiriHakPakaiAction, catatPembongkaranAction, ubahKontakPemegangHakAction } = await import(
  "../admin-lokasi/[lokasiId]/hak-pakai/[hakPakaiId]/actions"
);
const { default: HakPakaiLokasiPage } = await import("../admin-lokasi/[lokasiId]/hak-pakai/[hakPakaiId]/page");
const { default: PetakPage } = await import("../admin-lokasi/[lokasiId]/petak/[petakId]/page");
const { default: TagihanLewatJatuhTempoLokasiPage } = await import("../admin-lokasi/[lokasiId]/tagihan-lewat-jatuh-tempo/page");
const { default: PermintaanHakPakaiPage } = await import("../../(site)/permintaan-hak-pakai/[hakPakaiId]/page");
const { default: AkunMakamPage } = await import("../../(site)/akun/makam/page");

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const idle = { status: "idle" } as const;
const PEMEGANG = { name: "Budi Santoso", phoneNumber: "081234567890", email: "budi@contoh.id" };

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A Lokasi Mitra with one Terisi Petak and its Hak Pakai, made by its own Admin Lokasi. */
async function hakPakaiTerisi() {
  const admin = await signInAsAdminPlatform(server);
  const runtime = server.runtime();
  const created = await runtime.lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  const lokasiId = created.lokasiMitra.id;
  const adminLokasi = await signInAsAdminLokasi(server, admin, lokasiId);
  const jenis = await runtime.tariffs.createJenisMakam(admin, lokasiId, {
    name: "Reguler 1 × 2 m",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 1 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!jenis.ok) throw new Error(jenis.reason);
  const blok = await runtime.inventory.createBlok(adminLokasi, lokasiId, { name: "A", rows: 1, cols: 2, jenisMakamId: jenis.jenisMakam.id });
  if (!blok.ok) throw new Error(blok.reason);
  const denah = await runtime.inventory.asStaff(adminLokasi).blok(lokasiId, blok.blok.id);
  const petakId = denah!.cells.find((cell) => cell.kind === "petak")!.id;
  const diisi = await runtime.inventory.clearPetak(adminLokasi, lokasiId, petakId, { mode: "terisi", dataMenyusul: false, pemegangHak: PEMEGANG });
  if (!diisi.ok) throw new Error(diisi.reason);
  return { admin, adminLokasi, lokasiId, blokId: blok.blok.id, petakId, hakPakaiId: diisi.hakPakaiId! };
}

/** What a page renders, or why it would not render (notFound / redirect). */
async function buka(render: () => Promise<unknown>): Promise<string> {
  try {
    return renderToStaticMarkup((await render()) as React.ReactElement);
  } catch (error) {
    return `ditolak: ${(error as Error).message}`;
  }
}

describe("a Mitra Jasa never reaches a Hak Pakai", () => {
  it("is refused every read of it, and every staff permission on it, as itself", async () => {
    const { admin, adminLokasi, lokasiId, blokId, petakId } = await hakPakaiTerisi();
    const { inventory } = server.runtime();
    // The Admin Lokasi sees it, so each refusal below is about the role.
    expect(await inventory.asStaff(adminLokasi).hakPakaiOfPetak(lokasiId, petakId)).toMatchObject({ status: "aktif" });
    expect(await inventory.asStaff(adminLokasi).blok(lokasiId, blokId)).not.toBeNull();

    const mitra = await signInAsMitraJasa(server, admin);
    const staf = inventory.asStaff(mitra);
    expect(await staf.hakPakaiOfPetak(lokasiId, petakId)).toBeNull();
    expect(await staf.bloks(lokasiId)).toEqual([]);
    expect(await staf.blok(lokasiId, blokId)).toBeNull();
    // The family side: a Hak Pakai is read back only from its holder's own email, never the Mitra Jasa's.
    expect(await inventory.makamKeluargaSaya({ email: mitra.email })).toEqual([]);

    const tempat = lokasiMitraResource(lokasiId);
    for (const action of [
      "hak_pakai.ubah_pemegang",
      "hak_pakai.akhiri",
      "hak_pakai.catat_pembongkaran",
      "hak_pakai.selesaikan_verifikasi",
      "permintaan_hak_pakai.putuskan",
      "perpanjangan.periksa",
      "denah.ubah",
    ] as const) {
      expect({ action, allowed: authorize(mitra, action, tempat).allowed }).toEqual({ action, allowed: false });
      expect({ action, allowed: authorize(adminLokasi, action, tempat).allowed }).toEqual({ action, allowed: true });
    }
  });

  it("is refused every write on it, through the module and through the Hak Pakai screen's Server Actions, leaving it as it was", async () => {
    const { admin, adminLokasi, lokasiId, petakId, hakPakaiId } = await hakPakaiTerisi();
    const { inventory } = server.runtime();
    const semula = await inventory.hakPakaiById(hakPakaiId);
    const mitra: Actor = await signInAsMitraJasa(server, admin);

    expect(await inventory.akhiriHakPakaiManual(mitra, lokasiId, { hakPakaiId, alasan: "Sengaja" })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await inventory.catatPembongkaran(mitra, lokasiId, { hakPakaiId })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await inventory.ubahKontakPemegangHak(mitra, lokasiId, { hakPakaiId, phoneNumber: "089999999999", email: "lain@contoh.id", alasan: "Sengaja", ktpKey: "ktp/lain" })).toMatchObject({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(
      await inventory.gantiPemegangHak(mitra, lokasiId, { hakPakaiId, pemegangHak: { name: "Orang Lain", phoneNumber: "089999999999", email: "lain@contoh.id" }, alasan: "Sengaja" }),
    ).toMatchObject({ ok: false, reason: "tidak_berwenang" });

    const ditolak = { status: "gagal", message: "Anda tidak berwenang melakukan ini." };
    expect(await akhiriHakPakaiAction(idle, form({ lokasiId, hakPakaiId, alasan: "Sengaja" }))).toEqual(ditolak);
    expect(await catatPembongkaranAction(idle, form({ lokasiId, hakPakaiId }))).toEqual(ditolak);
    const ubahKontak = form({ lokasiId, hakPakaiId, phoneNumber: "089999999999", email: "lain@contoh.id", alasan: "Sengaja" });
    ubahKontak.set("ktp", new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2])], "ktp.jpg", { type: "image/jpeg" }));
    expect(await ubahKontakPemegangHakAction(idle, ubahKontak)).toEqual(ditolak);

    const hak = await inventory.asStaff(adminLokasi).hakPakaiOfPetak(lokasiId, petakId);
    expect(hak).toMatchObject({ status: "aktif" });
    expect(semula).toMatchObject({ status: "aktif", pemegangHak: { name: PEMEGANG.name } });
    expect(await inventory.hakPakaiById(hakPakaiId)).toEqual(semula);
  });

  it("is shown no page that carries it: the Admin Lokasi's screens send it away, the family's show it nothing", async () => {
    const { admin, lokasiId, petakId, hakPakaiId } = await hakPakaiTerisi();
    // Signed in as the Admin Lokasi, the Hak Pakai page shows the holder: the page is not empty for everyone.
    const sebagaiAdminLokasi = await buka(async () => HakPakaiLokasiPage({ params: Promise.resolve({ lokasiId, hakPakaiId }) } as never));
    expect(sebagaiAdminLokasi).toContain(PEMEGANG.name);

    await signInAsMitraJasa(server, admin);
    const halaman = [
      await buka(async () => HakPakaiLokasiPage({ params: Promise.resolve({ lokasiId, hakPakaiId }) } as never)),
      await buka(async () => PetakPage({ params: Promise.resolve({ lokasiId, petakId }) } as never)),
      await buka(async () => TagihanLewatJatuhTempoLokasiPage({ params: Promise.resolve({ lokasiId }), searchParams: Promise.resolve({}) } as never)),
      await buka(async () => PermintaanHakPakaiPage({ params: Promise.resolve({ hakPakaiId }) } as never)),
    ];
    for (const html of halaman) {
      expect(html).toMatch(/^ditolak: (notFound|redirect \/staf)/);
    }
    // The family's own Makam tab, open to any signed-in Akun, lists only the Hak Pakai held under its own email.
    const makam = await buka(async () => AkunMakamPage());
    expect(makam).not.toMatch(/^ditolak/);
    expect(makam).not.toContain(PEMEGANG.name);
    expect(makam).not.toContain(PEMEGANG.phoneNumber.slice(1));
  });
});
