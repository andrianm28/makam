/**
 * Peringatan Staf for a Tier 1 row of the Antrean (spec, Notifications; ticket
 * 28): a new row, the same row still untaken 30 min after, and a Konfirmasi TPU
 * Saat Duka still unconfirmed 90 min after. The Work Queues module decides who
 * and when (Bertugas, the 06:00 night rule, the escalation clocks); the words and
 * the channels (web push + email, logged, ADR 0004) are this module's.
 */
import type { StaffAlert, StaffAlertKind, StaffAlertResult } from "./index";

export const tahapPeringatanAntrean = ["baru", "eskalasi_30", "eskalasi_90"] as const;
export type TahapPeringatanAntrean = (typeof tahapPeringatanAntrean)[number];

export interface PeringatanAntreanInput {
  /** Every Akun Staf to alert: the Bertugas Admin Platform, or all of them. */
  to: { accountId: string }[];
  tahap: TahapPeringatanAntrean;
  /** The Antrean row: its type's label, what it is about (email only) and the staff page that opens it. */
  row: { label: string; subjectLabel: string; href: string };
}

export interface PeringatanAntreanResult {
  /** Akun Staf a Peringatan Staf was sent to (a recipient that lost its staff role is not counted). */
  dikirim: number;
}

const isi: Record<TahapPeringatanAntrean, { kind: StaffAlertKind; awalan: string; badan: string; email: string }> = {
  baru: {
    kind: "staf_antrean_mendesak",
    awalan: "Antrean mendesak",
    badan: "Baris Tier 1 menunggu diambil.",
    email: "Ada baris Tier 1 di Antrean yang menunggu untuk diambil (Ambil).",
  },
  eskalasi_30: {
    kind: "staf_antrean_eskalasi",
    awalan: "Belum diambil, 30 menit",
    badan: "Baris Tier 1 belum diambil siapa pun. Semua Admin Platform diberi tahu.",
    email: "Baris Tier 1 ini belum diambil (Ambil) sampai 30 menit setelah peringatan pertama, jadi semua Admin Platform diberi tahu.",
  },
  eskalasi_90: {
    kind: "staf_antrean_eskalasi",
    awalan: "Belum dikonfirmasi, 90 menit",
    badan: "Konfirmasi TPU Saat Duka belum selesai. Semua Admin Platform diberi tahu lagi.",
    email: "Konfirmasi TPU Saat Duka ini masih belum dikonfirmasi 90 menit setelah peringatan pertama, jadi semua Admin Platform diberi tahu lagi.",
  },
};

/** One Peringatan Staf per recipient, through `kirim` (Notifications' own `sendStaffAlert`, which logs each channel). */
export async function peringatanAntreanTier1(
  kirim: (alert: StaffAlert) => Promise<StaffAlertResult>,
  input: PeringatanAntreanInput,
): Promise<PeringatanAntreanResult> {
  const text = isi[input.tahap];
  let dikirim = 0;
  for (const to of input.to) {
    const result = await kirim({
      to,
      kind: text.kind,
      email: {
        subject: `${text.awalan}: ${input.row.label}`,
        text: [text.email, `${input.row.label}: ${input.row.subjectLabel}.`, "Buka Antrean di aplikasi staf untuk mengambil atau menanganinya."].join("\n"),
      },
      // A push shows on the lock screen: the row's kind only, never who it is about.
      push: { title: `${text.awalan}: ${input.row.label}`, body: text.badan, url: input.row.href },
    });
    if (result.ok) dikirim += 1;
  }
  return { dikirim };
}
