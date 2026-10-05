import { BanknoteIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { DaftarPencairan } from "./daftar-pencairan";

/**
 * Pencairan is the Mitra Jasa's own payments (spec, stories 181 and 182): every Pencairan of their jobs, newest first,
 * each with its status and its date, the Layanan, TPU, date and rate of its jobs, and the total, and a link to the Bukti
 * Pencairan of a transfer already made. Only their own and only that: the Payouts read hands over nothing else, and
 * a Ditangguhkan or Berhenti Mitra Jasa reads it too.
 */
export default async function PencairanPage() {
  const actor = await staffMenuActor("mitra_jasa");
  const hasil = await serverRuntime().payouts.daftarPencairanMitraJasa(actor);
  const pencairan = hasil.ok ? hasil.pencairan : [];

  return (
    <>
      <PageHeader
        title="Pencairan"
        description="Pembayaran Operator untuk Pekerjaan Layanan yang sudah selesai dan tidak lagi bisa dibatalkan, dari yang terbaru. Tarif Anda dibayar penuh."
      />
      {pencairan.length === 0 ? (
        <EmptyState
          icon={BanknoteIcon}
          title="Belum ada Pencairan"
          description="Pencairan pertama muncul di sini setelah Admin Platform menyetujui bukti pekerjaan Anda. Tiap Pencairan memuat Layanan, TPU, tanggal, dan tarif pekerjaannya."
        />
      ) : (
        <DaftarPencairan pencairan={pencairan} />
      )}
    </>
  );
}
