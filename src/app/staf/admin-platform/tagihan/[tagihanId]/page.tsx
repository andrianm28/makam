import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { buttonVariants } from "@/components/ui/button";
import { paymentMethodText, tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { BatalkanPembayaranLangsungForm, HargaKhususForm, PembayaranManualForm } from "./tagihan-forms";

const paramsSchema = z.object({ tagihanId: z.uuid() });

export async function generateMetadata({ params }: PageProps<"/staf/admin-platform/tagihan/[tagihanId]">): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const tagihan = parsed.success ? await serverRuntime().billing.tagihan(parsed.data.tagihanId) : null;
  return { title: tagihan ? `Tagihan ${tagihan.nomorTagihan} · Area Staf` : "Tagihan tidak ditemukan · Area Staf" };
}

/**
 * One Tagihan for Admin Platform (spec, Billing > Payment; stories 134, 163,
 * 164; ticket 30): its lines, who it is addressed to and when it is due, its
 * Bukti Pembayaran once Lunas, and the three writes only this role may make —
 * a payment by hand with its proof, a Harga Khusus (which replaces the
 * Tagihan rather than editing it), and reversing a "Dibayar langsung ke
 * Lokasi Mitra" record. The Tagihan's own Admin Lokasi records a direct
 * payment on the order's own page, never here (ticket 30's AC 2).
 */
export default async function TagihanPage({ params }: PageProps<"/staf/admin-platform/tagihan/[tagihanId]">) {
  await staffMenuActor("admin_platform");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { billing } = serverRuntime();
  const tagihan = await billing.tagihan(parsed.data.tagihanId);
  if (!tagihan) notFound();

  const dokumen = await billing.documentByLink(tagihan.link);
  const buktiLink = dokumen?.type === "tagihan" ? dokumen.buktiLink : null;
  const bukti = buktiLink ? await billing.documentByLink(buktiLink) : null;
  const buktiPembayaran = bukti?.type === "bukti_pembayaran" ? bukti.bukti : null;
  // Whether this Tagihan can still be paid, or replaced, is Billing's own answer, counted with the Clock.
  const bisaDibayar = dokumen?.type === "tagihan" && dokumen.notPayableBecause === null;
  const bisaDiganti = tagihan.status === "belum_dibayar" || tagihan.status === "lewat_jatuh_tempo";
  const dibayarLangsung = buktiPembayaran?.method.kind === "langsung_ke_lokasi";

  return (
    <>
      <PageHeader
        title={`Tagihan ${tagihan.nomorTagihan}`}
        description={
          bisaDibayar
            ? tagihan.kind === "pay_first"
              ? "Belum dibayar. Pembayaran boleh lewat QRIS, atau dicatat manual oleh Admin Platform dengan bukti."
              : "Belum dibayar, dan baru ditagih setelah pemakaman. Pembayaran boleh lewat QRIS, atau dicatat manual oleh Admin Platform dengan bukti."
            : "Tagihan ini sudah lunas atau ditutup, jadi tidak bisa dibayar lagi."
        }
      />

      <FormSection title="Tagihan">
        <dl className="grid gap-x-4 gap-y-1 text-body sm:grid-cols-[max-content_1fr]">
          <Baris label="Status" value={tagihanStatusText(tagihan.status)} />
          <Baris label="Ditagihkan kepada" value={`${tagihan.addressee.name} (${tagihan.addressee.role === "pemegang_hak" ? "Pemegang Hak" : "Pemesan"})`} />
          <Baris label="Nomor Pemesanan" value={tagihan.nomorPemesanan ?? "—"} />
          <Baris label="Lokasi" value={tagihan.placeName ?? "—"} />
          <Baris label="Terbit" value={formatTanggalJam(tagihan.issuedAt)} />
          <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
          {tagihan.replacesNomorTagihan ? <Baris label="Menggantikan" value={`Tagihan ${tagihan.replacesNomorTagihan}`} /> : null}
          {tagihan.replacedByNomorTagihan ? <Baris label="Digantikan oleh" value={`Tagihan ${tagihan.replacedByNomorTagihan}`} /> : null}
          {tagihan.hargaKhususPorsiMitra ? (
            <Baris
              label="Bagian Lokasi Mitra dari Harga Khusus"
              value={`${formatRupiah(tagihan.hargaKhususPorsiMitra.amount)} — ${tagihan.hargaKhususPorsiMitra.catatan}`}
            />
          ) : null}
        </dl>
      </FormSection>

      <FormSection title="Rincian">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-normal">
                Rincian
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Jumlah
              </th>
            </tr>
          </thead>
          <tbody>
            {tagihan.lines.map((line, index) => (
              <tr key={index} className="border-b">
                <td className="py-2 pr-4">{line.label}</td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatRupiah(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-3 pr-4 font-semibold">
                Total
              </th>
              <td className="pt-3 text-right text-base font-semibold whitespace-nowrap tabular-nums">{formatRupiah(tagihan.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-small text-muted-foreground">
          <Link href={documentPagePath(tagihan.link)} className="text-brand underline underline-offset-4">
            Buka Tagihan seperti keluarga membukanya
          </Link>
        </p>
      </FormSection>

      {buktiPembayaran ? (
        <FormSection title="Bukti Pembayaran" description={`${buktiPembayaran.nomorBukti}, ${formatTanggalJam(buktiPembayaran.paidAt)}`}>
          <dl className="grid gap-x-4 gap-y-1 text-body sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Metode</dt>
            <dd>{paymentMethodText(buktiPembayaran.method)}</dd>
            <dt className="text-muted-foreground">Jumlah diterima</dt>
            <dd className="tabular-nums">{formatRupiah(buktiPembayaran.amount)}</dd>
            {buktiPembayaran.reference ? (
              <>
                <dt className="text-muted-foreground">Referensi</dt>
                <dd className="font-mono">{buktiPembayaran.reference}</dd>
              </>
            ) : null}
          </dl>
          <Link href={documentPagePath(buktiPembayaran.link)} className={buttonVariants({ variant: "outline" })}>
            Lihat Bukti Pembayaran
          </Link>
        </FormSection>
      ) : null}

      {dibayarLangsung ? (
        <FormSection
          title="Batalkan pembayaran langsung"
          description="Pembayaran ini tercatat diterima langsung oleh Lokasi Mitra. Membatalkannya membuat Pencairan pesanan ini berjalan normal (tarif ke Lokasi Mitra) pada proses berikutnya, alih-alih Potongan biaya layanan platform. Tagihan dan Bukti Pembayaran di atas tidak berubah."
        >
          <BatalkanPembayaranLangsungForm tagihanId={tagihan.id} />
        </FormSection>
      ) : (
        <FormSection
          title="Catat pembayaran manual"
          description="Transfer manual atau tunai yang diterima Operator di luar pembayaran online. Wajib ada berkas bukti, dan pencatatan ini tercatat di Audit Log."
        >
          <PembayaranManualForm tagihanId={tagihan.id} total={tagihan.total} bisaDibayar={bisaDibayar} />
        </FormSection>
      )}

      <FormSection
        title="Harga Khusus"
        description="Pengurangan untuk keluarga, dicatat beserta alasannya. Tagihan ini tidak diedit: Tagihan lama dibatalkan dan diganti Tagihan baru yang memuat baris pengurangannya, dengan jatuh tempo yang sama."
      >
        <HargaKhususForm tagihanId={tagihan.id} total={tagihan.total} bisaDiubah={bisaDiganti} />
      </FormSection>
    </>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
