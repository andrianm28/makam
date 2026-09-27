import { describe, expect, it } from "vitest";
import { ATURAN_PENGINGAT, MAKS_PERCOBAAN, MOMEN_PAY_FIRST, TABEL_ACARA, TEMPLATE_EMAIL } from "@/domain/notifications";

/**
 * The event table and the reminder rules the spec lists, as the module
 * publishes them. What the window and the backoff do to real messages is
 * covered through the public send tick in `pesan-keluarga.test.ts` and
 * `telepon-pemesan.test.ts`.
 */
describe("Tabel acara: every domain event decides recipient, channel, template and timing", () => {
  it("a Tagihan issued goes to the family email as a transactional message, at any hour", () => {
    expect(TABEL_ACARA.tagihan_terbit).toEqual({
      penerima: "email_pemesan",
      kanal: "email",
      template: "tagihan_terbit",
      waktu: "transaksional",
    });
  });

  it("a Tagihan reminder goes to the family email inside the 08:00–20:00 window", () => {
    expect(TABEL_ACARA.tagihan_pengingat).toMatchObject({
      penerima: "email_pemesan",
      kanal: "email",
      waktu: "pengingat",
    });
  });

  it("a Bukti Pembayaran issued goes to the family email as a transactional message", () => {
    expect(TABEL_ACARA.bukti_pembayaran_terbit).toEqual({
      penerima: "email_pemesan",
      kanal: "email",
      template: "bukti_pembayaran_terbit",
      waktu: "transaksional",
    });
  });

  it("lists every family email template in one place", () => {
    expect([...TEMPLATE_EMAIL]).toEqual([
      "tagihan_terbit",
      "tagihan_pengingat_h_1",
      "tagihan_pengingat_hari_h",
      "bukti_pembayaran_terbit",
    ]);
  });
});

describe("Aturan pengingat Tagihan: exactly one rule per Tagihan kind, never stacked", () => {
  it("names the schedule and the ticket that owns it for every payment moment", () => {
    expect(ATURAN_PENGINGAT).toEqual({
      perpanjangan: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
      pengurusan_berkas: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
      layanan: { jadwal: "saat terbit, H-1 dan hari jatuh tempo", pemilik: "ticket-20" },
      terencana: { jadwal: "sekali, sekitar 4 jam sebelum hold berakhir", pemilik: "ticket-37" },
      paket_cycle: { jadwal: "H-7 (saat terbit) dan H-1", pemilik: "ticket-54" },
      saat_duka: { jadwal: "H+3, H+7, H+14, H+30", pemilik: "ticket-29" },
      pemakaman_hak_pakai_ada: { jadwal: "H+3, H+7, H+14, H+30", pemilik: "ticket-29" },
    });
  });

  it("schedules reminders only for the pay-first moments this ticket builds", () => {
    expect([...MOMEN_PAY_FIRST].sort()).toEqual(["layanan", "pengurusan_berkas", "perpanjangan"]);
  });
});

describe("Ulangi: 3 retries with backoff, then a phone-call row", () => {
  it("sends at most 4 times: the first send plus 3 retries", () => {
    expect(MAKS_PERCOBAAN).toBe(4);
  });
});
