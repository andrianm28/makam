import { describe, expect, it } from "vitest";
import { fiturUntukRute, fiturUntukTick, terbukaDi } from "./rilis-peta";
import { rilisAktif, rilisTerbuka } from "./rilis";

describe("Rilis terbuka (ADR 0006)", () => {
  it("production opens Rilis 1 unless the host says otherwise, staging and development open everything", () => {
    expect(rilisAktif({ APP_ENV: "production" })).toBe(1);
    expect(rilisAktif({ APP_ENV: "staging" })).toBe(3);
    expect(rilisAktif({ APP_ENV: "development" })).toBe(3);
    expect(rilisAktif({ APP_ENV: "test" })).toBe(3);
    expect(rilisAktif({})).toBe(3);
    expect(rilisAktif({ APP_ENV: "production", RILIS_TERBUKA: "2" })).toBe(2);
    expect(rilisAktif({ APP_ENV: "staging", RILIS_TERBUKA: "" })).toBe(3);
  });

  it("refuses a release number outside 1 to 3", () => {
    expect(() => rilisAktif({ APP_ENV: "production", RILIS_TERBUKA: "4" })).toThrow(/RILIS_TERBUKA/);
    expect(() => rilisAktif({ APP_ENV: "production", RILIS_TERBUKA: "0" })).toThrow(/RILIS_TERBUKA/);
    expect(() => rilisAktif({ APP_ENV: "production", RILIS_TERBUKA: "dua" })).toThrow(/RILIS_TERBUKA/);
  });

  it("a feature opens at its release: Rilis 2 at 2, Rilis 3 at 3, Rilis 1 always", () => {
    const production = { APP_ENV: "production" };
    expect(rilisTerbuka("perpanjangan_lanjutan", production)).toBe(false);
    expect(rilisTerbuka("lokasi_ditangguhkan", production)).toBe(false);
    expect(rilisTerbuka("tpu", production)).toBe(false);
    expect(rilisTerbuka("mitra_jasa", production)).toBe(false);
    expect(rilisTerbuka("wakaf", production)).toBe(false);
    expect(rilisTerbuka("inti", production)).toBe(true);
    expect(rilisTerbuka("perpanjangan_lanjutan", { ...production, RILIS_TERBUKA: "2" })).toBe(true);
    expect(rilisTerbuka("tpu", { ...production, RILIS_TERBUKA: "2" })).toBe(false);
    expect(rilisTerbuka("tpu", { APP_ENV: "staging" })).toBe(true);
    expect(terbukaDi("wakaf", 3)).toBe(true);
  });

  it("each Rilis 2 and Rilis 3 route belongs to its feature; Layanan at a Lokasi Mitra stays in Rilis 1", () => {
    expect(fiturUntukRute("/perpanjangan/abc/berkas")).toBe("perpanjangan_lanjutan");
    expect(fiturUntukRute("/perpanjangan/permohonan/xyz")).toBe("perpanjangan_lanjutan");
    expect(fiturUntukRute("/staf/admin-lokasi/lok1/perpanjangan/p1")).toBe("perpanjangan_lanjutan");
    expect(fiturUntukRute("/perpanjangan/abc")).toBe("inti");
    expect(fiturUntukRute("/tpu/t1")).toBe("tpu");
    expect(fiturUntukRute("/lokasi", "jenis=tpu")).toBe("tpu");
    expect(fiturUntukRute("/lokasi", "")).toBe("inti");
    expect(fiturUntukRute("/pengurusan/PNG-1/surat-kuasa")).toBe("tpu");
    expect(fiturUntukRute("/pesan-makam/saat-duka/tpu")).toBe("tpu");
    expect(fiturUntukRute("/pesan-makam/saat-duka")).toBe("inti");
    expect(fiturUntukRute("/layanan/tpu")).toBe("tpu");
    expect(fiturUntukRute("/layanan")).toBe("inti");
    expect(fiturUntukRute("/staf/admin-platform/mitra-jasa/m1")).toBe("mitra_jasa");
    expect(fiturUntukRute("/staf/mitra-jasa/pekerjaan")).toBe("mitra_jasa");
    expect(fiturUntukRute("/wakaf-tanah")).toBe("wakaf");
    expect(fiturUntukRute("/akun/wakaf")).toBe("wakaf");
    expect(fiturUntukRute("/akun/pesanan")).toBe("inti");
    expect(fiturUntukRute("/staf/admin-platform/wakaf/nazhir")).toBe("wakaf");
    expect(fiturUntukRute("/halaman-baru-yang-belum-dipetakan")).toBeUndefined();
  });

  it("the Hak Pakai reminders, the expiry and the Berhenti effective date are ticks of their release", () => {
    expect(fiturUntukTick("perpanjangan.pengingat_hak_pakai")).toBe("perpanjangan_lanjutan");
    expect(fiturUntukTick("inventory.hak_pakai_kedaluwarsa")).toBe("perpanjangan_lanjutan");
    expect(fiturUntukTick("lokasi.berhenti_berlaku")).toBe("lokasi_ditangguhkan");
    expect(fiturUntukTick("billing.lapse_pay_first_tagihan")).toBe("inti");
    expect(fiturUntukTick("tick.baru")).toBeUndefined();
  });
});
