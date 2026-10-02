import Link from "next/link";
import type { PengurusanOrder, PengurusanTpuStatus } from "@/domain/pengurusan";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { BatalkanPengurusanForm, UnggahDokumenForm } from "./pengajuan-forms";

const LABEL: Partial<Record<PengurusanTpuStatus, string>> = {
  diajukan: "Diajukan",
  dikonfirmasi: "Dikonfirmasi",
  dimakamkan: "Dimakamkan",
  dokumen_lengkap: "Dokumen Lengkap",
  menunggu_pembayaran: "Menunggu Pembayaran",
  diproses: "Sudah dibayar, menunggu pengajuan",
  perlu_perbaikan: "Perlu Perbaikan",
  ditolak: "Ditolak",
  iptm_diajukan: "IPTM Diajukan",
  iptm_terbit: "IPTM Terbit",
  dibatalkan: "Dibatalkan",
};

/** Cancelling is open until the IPTM is filed (spec, Pengurusan). */
const BOLEH_BATAL: PengurusanTpuStatus[] = ["diajukan", "dikonfirmasi", "dimakamkan", "dokumen_lengkap", "menunggu_pembayaran"];

/**
 * What the Pemesan follows after the confirmation (spec, Pengurusan; stories 74-77): the timeline, the
 * Surat Kuasa to print and sign, the filing documents due 7 days after the burial, the IPTM scan once
 * it is issued, and the cancellation while it is still open.
 */
export function PengajuanPemesan({ order, scanUrl }: { order: PengurusanOrder; scanUrl: string | null }) {
  const { status, pengajuan } = order;
  const unggah = status === "dimakamkan" || status === "perlu_perbaikan" || (order.kind === "perpanjangan_tpu" && status === "diajukan");
  return (
    <>
      <section className="flex flex-col gap-3" aria-label="Linimasa">
        <h2 className="text-title-3 text-foreground">Linimasa</h2>
        <ol className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-body" data-testid="linimasa">
          {order.riwayat.map((langkah) => (
            <li key={langkah.status} className="flex justify-between gap-2">
              <span className="font-medium text-foreground">{LABEL[langkah.status] ?? langkah.status}</span>
              <span className="text-muted-foreground">{formatTanggalJam(langkah.pada)}</span>
            </li>
          ))}
        </ol>
      </section>

      {unggah || status === "dokumen_lengkap" || status === "menunggu_pembayaran" || status === "diproses" || status === "iptm_diajukan" ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Berkas pengajuan IPTM">
          <h2 className="text-title-3 text-foreground">Berkas pengajuan IPTM</h2>
          {status === "perlu_perbaikan" && order.alasan ? (
            <p className="text-body font-medium text-foreground" role="alert">
              Perbaikan diminta: {order.alasan}. Unggah ulang dokumen di bawah; tidak ada biaya baru.
            </p>
          ) : null}
          {status === "dimakamkan" && pengajuan.dokumenDueAt ? (
            <p className="text-small text-muted-foreground">Unggah paling lambat {formatTanggalJam(pengajuan.dokumenDueAt)}.</p>
          ) : null}
          <p className="text-body">
            Surat Kuasa untuk PT Jaya Korpora Prima:{" "}
            <Link href={`/pengurusan/${order.nomor}/surat-kuasa`} className="font-medium text-brand underline underline-offset-4">
              buka dan cetak
            </Link>{" "}
            atau{" "}
            <a href={`/pengurusan/${order.nomor}/surat-kuasa/pdf`} className="font-medium text-brand underline underline-offset-4">
              unduh PDF
            </a>
            , tanda tangani Pemegang Hak, lalu unggah fotonya di bawah.
          </p>
          {unggah ? (
            pengajuan.kurang.length > 0 ? (
              <div className="flex flex-col gap-4">
                {pengajuan.kurang.map((nama) => (
                  <UnggahDokumenForm key={nama} nomor={order.nomor} nama={nama} />
                ))}
              </div>
            ) : (
              <p className="text-body">Semua berkas sudah kami terima. Tim kami memeriksanya.</p>
            )
          ) : (
            <p className="text-body">
              Berkas lengkap.{" "}
              {status === "iptm_diajukan"
                ? "IPTM sudah diajukan di JakEVO."
                : status === "menunggu_pembayaran"
                  ? "Bayar Tagihan agar kami bisa mengajukan IPTM. Tagihan yang tidak dibayar dalam 3×24 jam membatalkan pesanan."
                  : "IPTM akan diajukan oleh tim kami."}
            </p>
          )}
        </section>
      ) : null}

      {status === "iptm_terbit" ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="IPTM terbit">
          <h2 className="text-title-3 text-foreground">IPTM terbit</h2>
          {order.iptm ? <p className="text-body">Berlaku sampai {order.iptm.berlakuSampai}.</p> : null}
          {scanUrl ? (
            <a href={scanUrl} className="font-medium text-brand underline underline-offset-4">
              Unduh scan IPTM
            </a>
          ) : null}
          <p className="text-small text-muted-foreground">IPTM tetap dikirim walaupun Tagihan belum dibayar.</p>
        </section>
      ) : null}

      {status === "ditolak" ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" aria-label="Ditolak">
          <h2 className="text-title-3 text-foreground">Pengajuan ditolak PTSP</h2>
          {order.alasan ? <p className="text-body">Alasan: {order.alasan}</p> : null}
          <p className="text-small text-muted-foreground">Seluruh pembayaran Anda, Biaya Pengurusan termasuk, dikembalikan.</p>
        </section>
      ) : null}

      {BOLEH_BATAL.includes(status) ? (
        <section className="flex flex-col gap-2" aria-label="Batalkan">
          <h2 className="text-title-3 text-foreground">Batalkan pengurusan</h2>
          <p className="text-small text-muted-foreground">
            Bisa dibatalkan sampai IPTM diajukan. Tagihan yang belum dibayar dibatalkan{order.kind === "perpanjangan_tpu" ? "." : "; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak pemakaman diatur dengan TPU."}
          </p>
          <BatalkanPengurusanForm nomor={order.nomor} />
        </section>
      ) : null}
    </>
  );
}
