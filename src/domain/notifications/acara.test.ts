import { describe, expect, it } from "vitest";
import { ATURAN_PENGINGAT, MACAM_MOMEN_TAGIHAN, TABEL_ACARA, TEMPLATE_EMAIL, WAKTU_TEMPLATE } from "@/domain/notifications";

/**
 * The event table and the reminder rules as the module publishes them, for
 * anything that reports on them (AC 1: the table is in code, the email
 * templates listed in one place). What the window and the retries do to real
 * messages is covered through the public send tick in
 * `pesan-keluarga.test.ts` and `telepon-pemesan.test.ts`.
 */
describe("Tabel acara: every domain event decides recipient, channel, template and timing", () => {
  it.each([
    ["pesanan_diajukan", "pesanan_diajukan", "transaksional"],
    ["pesanan_dikonfirmasi", "pesanan_dikonfirmasi", "transaksional"],
    ["bukti_pemesanan_terbit", "bukti_pemesanan_terbit", "transaksional"],
    ["bukti_perpanjangan_terbit", "bukti_perpanjangan_terbit", "transaksional"],
    ["tagihan_terbit", "tagihan_terbit", "pengingat"],
    ["tagihan_pengingat", "tagihan_pengingat_h_1", "pengingat"],
    ["bukti_pembayaran_terbit", "bukti_pembayaran_terbit", "transaksional"],
  ] as const)("%s goes to the family by email, %s, %s", (acara, template, waktu) => {
    expect(TABEL_ACARA[acara]).toEqual({ penerima: "email_pemesan", kanal: "email", template, waktu });
  });

  it("a Peringatan Staf goes to the Akun Staf by push and email, at any hour", () => {
    expect(TABEL_ACARA.peringatan_staf).toEqual({
      penerima: "akun_staf",
      kanal: "push_dan_email",
      template: "peringatan_staf",
      waktu: "transaksional",
    });
  });

  it("lists every family email template in one place, and times each of them once", () => {
    expect([...TEMPLATE_EMAIL]).toEqual([
      "pesanan_diajukan",
      "pesanan_dikonfirmasi",
      "pesanan_ditolak",
      "pesanan_alternatif_ditawarkan",
      "pesanan_dibatalkan",
      "bukti_pemesanan_terbit",
      "bukti_perpanjangan_terbit",
      "tagihan_terbit",
      "tagihan_pengingat_h_1",
      "tagihan_pengingat_hari_h",
      // A Pemesanan Terencana's payment hold (ticket 37): once, about 4 h before it ends.
      "tagihan_pengingat_tahan",
      // Pay-after Chasing (ticket 29): H+3, H+7, H+14, H+30 of the overdue anchor.
      "tagihan_pengingat_h3",
      "tagihan_pengingat_h7",
      "tagihan_pengingat_h14",
      "tagihan_pengingat_h30",
      "bukti_pembayaran_terbit",
      // A Saat Duka TPU confirmation (ticket 45): transactional, like the two
      // Lokasi Mitra order messages, because the burial is already arranged.
      "pengurusan_dikonfirmasi",
      // A Bukti Pengembalian Dana issued (ticket 31): transactional, like a
      // Bukti Pembayaran — the money already moved, so it asks nothing.
      "pengembalian_terbit",
      "layanan_pesanan_terbit",
      "layanan_pekerjaan_selesai",
      // A Paket Layanan cycle over the QRIS cap pauses the Paket and tells the
      // Pemesan (ticket 54): it asks them to act, so it waits for the window.
      "paket_siklus_dijeda",
      // The Admin Lokasi's answer to a Pembatalan request (ticket 38): transactional.
      "pembatalan_terencana",
    ]);
    expect(Object.keys(WAKTU_TEMPLATE)).toEqual([...TEMPLATE_EMAIL]);
  });

  it("times a Saat Duka TPU confirmation as transactional, like the two Lokasi Mitra order messages", () => {
    expect(WAKTU_TEMPLATE.pengurusan_dikonfirmasi).toBe("transaksional");
    expect(TABEL_ACARA.pengurusan_dikonfirmasi).toEqual({
      penerima: "email_pemesan",
      kanal: "email",
      template: "pengurusan_dikonfirmasi",
      waktu: "transaksional",
    });
  });

  it("times an order Layanan and a finished job as transactional: neither asks anything", () => {
    // A family's order and its proof are both things they asked for and are waiting
    // on, so neither waits for the 08:00–20:00 window a money reminder does.
    expect(WAKTU_TEMPLATE.layanan_pesanan_terbit).toBe("transaksional");
    expect(WAKTU_TEMPLATE.layanan_pekerjaan_selesai).toBe("transaksional");
    expect(TABEL_ACARA.layanan_pesanan_terbit).toEqual({
      penerima: "email_pemesan",
      kanal: "email",
      template: "layanan_pesanan_terbit",
      waktu: "transaksional",
    });
    expect(TABEL_ACARA.layanan_pekerjaan_selesai.waktu).toBe("transaksional");
  });

  it("times the Tagihan on issue as a reminder, inside 08:00–20:00 WIB", () => {
    // The spec's reminder table puts "on issue" with H-1 and the due day, and
    // all of them inside the window.
    expect(WAKTU_TEMPLATE.tagihan_terbit).toBe("pengingat");
    expect(TABEL_ACARA.tagihan_terbit.waktu).toBe("pengingat");
  });
});

describe("Aturan pengingat Tagihan: exactly one rule per Tagihan kind, never stacked", () => {
  it("names the schedule of every payment moment, and nothing but a schedule", () => {
    expect(ATURAN_PENGINGAT).toEqual({
      perpanjangan: "saat terbit, H-1 dan hari jatuh tempo",
      pengurusan_berkas: "saat terbit, H-1 dan hari jatuh tempo",
      layanan: "saat terbit, H-1 dan hari jatuh tempo",
      terencana: "sekali, sekitar 4 jam sebelum hold berakhir",
      paket_cycle: "H-7 (saat terbit) dan H-1",
      saat_duka: "H+3, H+7, H+14, H+30",
      pemakaman_hak_pakai_ada: "H+3, H+7, H+14, H+30",
    });
  });

  it("covers every payment moment a Tagihan can be issued for, so no kind is left without a rule", () => {
    expect(Object.keys(ATURAN_PENGINGAT).sort()).toEqual([...MACAM_MOMEN_TAGIHAN].sort());
  });
});
