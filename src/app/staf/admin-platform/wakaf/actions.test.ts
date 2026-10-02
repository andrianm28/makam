import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { cocokkanNazhirPengajuan, hapusNazhirDaftar, pindahStatusPengajuan, tambahNazhirDaftar, tulisCatatanPengajuan } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
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

async function pengajuanBaru() {
  const akun = await server.logIn("wakif@contoh.id");
  const hasil = await server.runtime().wakaf.ajukanWakaf(
    { accountId: akun.account.id, email: "wakif@contoh.id" },
    {
      tujuan: "sosial",
      wakifNama: "Haji Slamet",
      wakifTelepon: "0812 3456 7890",
      hubunganDenganTanah: "Pemilik",
      kabKota: "Kota Depok",
      alamat: "Jl. Raya Sawangan No. 12",
      pin: null,
      luasM2: 1500,
      jenisBukti: "SHM",
    },
  );
  if (!hasil.ok) throw new Error(hasil.reason);
  return hasil.pengajuanId;
}

describe("Wakaf Tanah di Admin Platform: Server Actions", () => {
  it("Admin Platform menambah dan menghapus Nazhir; isian yang kosong ditolak dengan alasan", async () => {
    const admin = await signInAsAdminPlatform(server);

    expect(await tambahNazhirDaftar(idle, form({ nama: "", jenis: "organisasi", kabKota: "Kota Depok", kontak: "0811", nomorBwi: "BWI-1" }))).toEqual({
      status: "gagal",
      message: "Periksa lagi isian Anda.",
    });
    expect(await tambahNazhirDaftar(idle, form({ nama: "Yayasan Al-Ikhlas", jenis: "organisasi", kabKota: "Kota Depok", kontak: "0811", nomorBwi: "BWI-1" }))).toEqual({
      status: "berhasil",
      message: "Nazhir ditambahkan.",
    });
    const [nazhir] = await server.runtime().wakaf.daftarNazhir(admin);
    expect(nazhir?.nama).toBe("Yayasan Al-Ikhlas");

    expect(await hapusNazhirDaftar(idle, form({ nazhirId: nazhir!.id }))).toEqual({ status: "berhasil", message: "Nazhir dihapus." });
    expect(await server.runtime().wakaf.daftarNazhir(admin)).toEqual([]);
  });

  it("Admin Platform memindahkan Pengajuan Wakaf ke Ditinjau, menulis catatan untuk Wakif dan internal, dan mencocokkan Nazhir", async () => {
    const admin = await signInAsAdminPlatform(server);
    const id = await pengajuanBaru();

    expect(await pindahStatusPengajuan(idle, form({ pengajuanId: id, status: "ditinjau" }))).toEqual({ status: "berhasil", message: "Status diperbarui." });
    expect(await tulisCatatanPengajuan(idle, form({ pengajuanId: id, jenis: "internal", isi: "Sertifikat perlu dicek" }))).toEqual({
      status: "berhasil",
      message: "Catatan disimpan.",
    });
    expect(await tulisCatatanPengajuan(idle, form({ pengajuanId: id, jenis: "wakif", isi: "Mohon lengkapi KTP" }))).toEqual({
      status: "berhasil",
      message: "Catatan disimpan.",
    });
    const dibuat = await server.runtime().wakaf.tambahNazhir(admin, { nama: "Yayasan Al-Ikhlas", jenis: "organisasi", kabKota: "Kota Depok", kontak: "0811", nomorBwi: "BWI-1" });
    if (!dibuat.ok) throw new Error(dibuat.reason);
    expect(await cocokkanNazhirPengajuan(idle, form({ pengajuanId: id, nazhirId: dibuat.nazhir.id }))).toEqual({ status: "berhasil", message: "Nazhir dicocokkan." });

    const hasil = await server.runtime().wakaf.pengajuanStaf(admin, id);
    if (!hasil.ok) throw new Error(hasil.reason);
    expect(hasil.pengajuan.status).toBe("ditinjau");
    expect(hasil.pengajuan.nazhirNama).toBe("Yayasan Al-Ikhlas");
    expect(hasil.pengajuan.catatan.map((satu) => satu.jenis).sort()).toEqual(["internal", "wakif"]);
  });

  it("menyebut apa yang kurang bila Survei Dijadwalkan tanpa tanggal", async () => {
    await signInAsAdminPlatform(server);
    const id = await pengajuanBaru();
    await pindahStatusPengajuan(idle, form({ pengajuanId: id, status: "ditinjau" }));

    const hasil = await pindahStatusPengajuan(idle, form({ pengajuanId: id, status: "survei_dijadwalkan" }));

    expect(hasil.status).toBe("gagal");
    expect(hasil.status === "gagal" && hasil.message).toMatch(/tanggal/i);
  });

  it("menolak Admin Lokasi di setiap tindakan", async () => {
    const admin = await signInAsAdminPlatform(server);
    const id = await pengajuanBaru();
    const lokasi = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!lokasi.ok) throw new Error(lokasi.reason);
    await signInAsAdminLokasi(server, admin, lokasi.lokasiMitra.id);

    const ditolak = { status: "gagal", message: "Anda tidak berwenang melakukan ini." };
    expect(await pindahStatusPengajuan(idle, form({ pengajuanId: id, status: "ditinjau" }))).toEqual(ditolak);
    expect(await tulisCatatanPengajuan(idle, form({ pengajuanId: id, jenis: "internal", isi: "x" }))).toEqual(ditolak);
    expect(await tambahNazhirDaftar(idle, form({ nama: "A", jenis: "organisasi", kabKota: "Kota Depok", kontak: "1", nomorBwi: "2" }))).toEqual(ditolak);
  });
});
