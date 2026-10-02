import type { WorkingTimeResult } from "@/domain/lokasi";
import type { PemesananAhliWaris, PemesananDiajukan, TerencanaDiajukan } from "@/domain/pemesanan";
import type { Tenure } from "@/domain/tariffs";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import type { PushNotification } from "@/ports/web-push";

/**
 * How the Pemesanan module's words reach a family and a staff member: the Bahasa
 * Indonesia for every refusal a Kirim can meet, the Masa Hak Pakai a card
 * states, the confirmation promise the working-time calculator answers, and the
 * Peringatan Staf a new order raises. The module carries the facts; the wording
 * lives here, once.
 */

/** Every reason a Kirim can be refused: the module's own, and the guard's. */
export type PemesananRefusal =
  | "email_bukan_akun_ini"
  | "lokasi_tidak_terbuka"
  | "harga_tidak_tersedia"
  | "pemesan_kosong"
  | "almarhum_kosong"
  | "pemegang_hak_almarhum"
  | "layanan_tidak_tersedia"
  | "teks_kosong"
  | "tidak_berwenang"
  | "perlu_totp"
  | "input_tidak_valid";

/** The message for a refusal, saying what to do next rather than only what went wrong. */
export function pemesananMessage(reason: PemesananRefusal): string {
  switch (reason) {
    case "email_bukan_akun_ini":
      return "Email ini bukan email akun Anda. Kirim ulang dengan email lain.";
    case "lokasi_tidak_terbuka":
      return "Lokasi Mitra ini sudah tidak menerima pesanan. Pilih Lokasi Mitra lain.";
    case "harga_tidak_tersedia":
      return "Harga Hak Pakai ini belum tersedia atau sudah berubah. Kembali ke pilihan makam.";
    case "pemesan_kosong":
      return "Tulis nama lengkap Anda.";
    case "almarhum_kosong":
      return "Tulis nama almarhum / almarhumah.";
    case "pemegang_hak_almarhum":
      return "Pemegang Hak tidak boleh almarhum / almarhumah. Pilih Pemegang Hak lain.";
    case "layanan_tidak_tersedia":
      return "Layanan hari-H yang Anda pilih tidak tersedia di Lokasi Mitra ini. Hapus layanan itu lalu kirim lagi.";
    case "teks_kosong":
      return "Isi tulisan yang diminta layanan hari-H Anda.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
  }
  // Exhaustive: a new refusal reason fails the typecheck here until it has a message.
  const unhandled: never = reason;
  throw new Error(`No message for ${String(unhandled)}`);
}

/** The Masa Hak Pakai a card or an order words. */
export function tenureLabel(tenure: Tenure): string {
  return tenure.kind === "selamanya" ? "selamanya" : `${tenure.years} tahun`;
}

/**
 * The confirmation promise, as a card says it: when the Lokasi will confirm at
 * the latest, or that it cannot promise one (no Jam Operasional to count in).
 */
export function konfirmasiLabel(batas: WorkingTimeResult): string {
  if (batas.ok) return `Dikonfirmasi paling lambat ${formatTanggalJam(batas.at)}`;
  return batas.reason === "jam_operasional_belum_diisi"
    ? "Lokasi Mitra ini belum membuka jam operasionalnya, jadi belum ada janji konfirmasi."
    : "Lokasi Mitra ini belum punya jam buka, jadi belum ada janji konfirmasi.";
}

/**
 * The Peringatan Staf a new order raises: the email a Lokasi Mitra's staff
 * read, and the push that shows on a lock screen. The push carries no personal
 * data (Notifications refuses that), so the order is named by its Nomor
 * Pemesanan and its Lokasi Mitra; the email may carry the rest. `url` is the
 * Lokasi Mitra's page in the staff area, where its orders are confirmed.
 */
export function stafSaatDukaBaruAlert(
  order: PemesananDiajukan,
): { email: { subject: string; text: string }; push: PushNotification & { url: string } } {
  const pemakaman = order.rencanaPemakamanAt
    ? `Rencana pemakaman: ${formatTanggalJam(order.rencanaPemakamanAt)} (Lokasi Mitra yang menentukan hari).`
    : "Rencana pemakaman: belum ada; hubungi keluarga untuk waktunya.";
  const tenggat = order.konfirmasiDueAt ? `Konfirmasi paling lambat ${formatTanggalJam(order.konfirmasiDueAt)}.` : "Lokasi Mitra ini belum punya jam operasional, jadi belum ada janji konfirmasi.";
  return {
    email: {
      subject: `Pesan Saat Duka baru ${order.nomor}`,
      text: [
        `${order.pemesan.name} memesan satu ${order.jenisMakamName} untuk ${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}.`,
        `Lokasi Mitra: ${order.lokasi.name}.`,
        pemakaman,
        tenggat,
        order.pemesan.phoneNumber ? `Telepon Pemesan: ${order.pemesan.phoneNumber}.` : "Pemesan belum memberi nomor telepon.",
        `Nomor Pemesanan: ${order.nomor}. Buka halaman Lokasi Mitra ini di aplikasi staf untuk mengonfirmasi.`,
      ].join("\n"),
    },
    push: {
      title: "Pesan Saat Duka baru",
      body: `${order.lokasi.name} · ${order.nomor}`,
      url: `/staf/admin-lokasi/${order.lokasi.id}`,
    },
  };
}

/**
 * The Peringatan Staf a new Pemesanan Terencana raises (ticket 97). It names the
 * Lokasi Mitra, the Nomor Pemesanan and how many plots were picked, and sets no
 * deadline: the confirmation row in the Antrean Lokasi is non-urgent. The push
 * carries no personal data; `url` is the order's page in the staff area.
 */
export function stafTerencanaBaruAlert(
  order: TerencanaDiajukan,
): { email: { subject: string; text: string }; push: PushNotification & { url: string } } {
  const jumlah = `${order.unit.length} petak/kavling`;
  return {
    email: {
      subject: `Pesan Terencana baru ${order.nomor}`,
      text: [
        `${order.pemesan.name} memesan ${jumlah} secara terencana di ${order.lokasi.name}.`,
        `Petak/Kavling: ${order.unit.map((satu) => `${satu.nomor} (${satu.jenisMakamName})`).join(", ")}.`,
        order.pemesan.phoneNumber ? `Telepon Pemesan: ${order.pemesan.phoneNumber}.` : "Pemesan belum memberi nomor telepon.",
        `Nomor Pemesanan: ${order.nomor}. Buka pesanan ini di aplikasi staf untuk mengonfirmasi atau menolaknya.`,
      ].join("\n"),
    },
    push: {
      title: "Pesan Terencana baru",
      body: `${order.lokasi.name} · ${order.nomor} · ${jumlah}`,
      url: `/staf/admin-lokasi/${order.lokasi.id}/pesanan/${order.nomor}`,
    },
  };
}

/**
 * The Peringatan Staf an heirship proof raises (ticket 35, owner Q16): the Admin Lokasi is reminded to record a Ganti Pemegang Hak
 * to the heir who brought the proof. The push carries no personal data; `url` is the order's page in the staff area.
 */
export function stafGantiPemegangHakAlert(
  order: PemesananAhliWaris,
): { email: { subject: string; text: string }; push: PushNotification & { url: string } } {
  return {
    email: {
      subject: `Catat Ganti Pemegang Hak: bukti ahli waris pada pesanan ${order.nomor}`,
      text: [
        `Bukti ahli waris dicatat untuk pemakaman ${order.almarhumName} di ${order.lokasi.name} (pesanan ${order.nomor}).`,
        "Catat Ganti Pemegang Hak ke ahli waris yang membawa bukti ini.",
        `Buka pesanan ${order.nomor} di aplikasi staf.`,
      ].join("\n"),
    },
    push: {
      title: "Catat Ganti Pemegang Hak",
      body: `${order.lokasi.name} · ${order.nomor}`,
      url: `/staf/admin-lokasi/${order.lokasi.id}/pesanan/${order.nomor}`,
    },
  };
}

/** How many whole days a number of hours is, when it is whole (72 → 3). */
const HARI = 24;

/** "tiga hari", "sehari", "lima hari": an Indonesian duration in words, days first. */
const HARI_DALAM_KATA: Record<number, string> = {
  1: "sehari",
  2: "dua hari",
  3: "tiga hari",
  4: "empat hari",
  5: "lima hari",
  6: "enam hari",
  7: "tujuh hari",
  10: "sepuluh hari",
  14: "dua minggu",
  30: "sebulan",
};

/**
 * When a Saat Duka Tagihan falls due, in the words a family reads (spec,
 * Pemesanan: the pay-after Tagihan is due the Lokasi Mitra's payment window
 * after the burial). The window is the Lokasi's own policy, so the number comes
 * from it and never from a default written in copy; `null` — a Lokasi whose
 * policy cannot be read — says so instead of guessing.
 */
export function jatuhTempoLabel(jam: number | null): string {
  if (jam === null || !(jam > 0)) return "sesuai jangka yang ditetapkan Lokasi Mitra";
  if (jam % HARI === 0) {
    const hari = jam / HARI;
    const kata = HARI_DALAM_KATA[hari];
    if (kata) return `jatuh tempo ${kata} setelah pemakaman`;
  }
  return `jatuh tempo ${jam} jam setelah pemakaman`;
}

/**
 * The re-alert, one hour of the Lokasi's Jam Operasional after the new-order
 * alert went out: the same work, once more, for whoever was on duty then. The
 * push carries no personal data (Notifications refuses that), so the order is
 * named by its Nomor Pemesanan and its Lokasi Mitra, as the first alert did.
 */
export function stafSaatDukaBelumDikonfirmasiAlert(
  order: PemesananDiajukan,
): { email: { subject: string; text: string }; push: PushNotification & { url: string } } {
  return {
    email: {
      subject: `Pesan ${order.nomor} belum dikonfirmasi`,
      text: [
        `Pesan Saat Duka ${order.nomor} untuk ${order.almarhum.name} di ${order.lokasi.name} belum dikonfirmasi.`,
        order.konfirmasiDueAt
          ? `Batasnya ${formatTanggalJam(order.konfirmasiDueAt)}; setelah itu Admin Platform menelepon Lokasi Mitra ini.`
          : "Lokasi Mitra ini belum punya jam operasional, jadi belum ada batas konfirmasi.",
        order.pemesan.phoneNumber ? `Telepon Pemesan: ${order.pemesan.phoneNumber}.` : "Pemesan belum memberi nomor telepon.",
        `Nomor Pemesanan: ${order.nomor}. Buka halaman Lokasi Mitra ini di aplikasi staf untuk mengonfirmasi.`,
      ].join("\n"),
    },
    push: {
      title: "Pesan belum dikonfirmasi",
      body: `${order.lokasi.name} · ${order.nomor}`,
      url: `/staf/admin-lokasi/${order.lokasi.id}`,
    },
  };
}
