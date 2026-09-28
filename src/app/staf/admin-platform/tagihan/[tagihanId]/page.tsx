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
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { HargaKhususForm, PembayaranManualForm } from "./tagihan-forms";

const paramsSchema = z.uuid();

export async function generateMetadata({ params }: PageProps<"/staf/admin-platform/tagihan/[tagihanId]">): Promise<Metadata> {
  const { tagihanId } = await params;
  const parsed = paramsSchema.safeParse(tagihanId);
  const tagihan = parsed.success ? await serverRuntime().billing.tagihan(parsed.data) : null;
  return { title: tagihan ? `Tagihan ${tagihan.nomorTagihan} · Area Staf` : "Tagihan tidak ditemukan · Area Staf" };
}

/**
 * One Tagihan for Admin Platform (spec, Billing): its lines, who it is addressed
 * to and when it is due, what it is Lunas with, and the two writes only this role
 * may make on it — a payment by hand with its proof, and a Harga Khusus, which
 * replaces the Tagihan rather than editing it.
 *
 * Admin Platform is the only role that reaches this page, and the module behind
 * it checks that again on every write: an Admin Lokasi records a payment its own
 * family made directly to it on the order's own page, never here.
 */
export default async function TagihanPage({ params }: PageProps<"/staf/admin-platform/tagihan/[tagihanId]">) {
  await staffMenuActor("admin_platform");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { billing, pemesanan } = serverRuntime();
  const tagihan = await billing.tagihan(parsed.data);
  if (!tagihan) notFound();

  const dokumen = await billing.documentByLink(tagihan.link);
  const buktiLink = dokumen?.type === "tagihan" ? dokumen.buktiLink : null;
  const bukti = buktiLink ? await billing.documentByLink(buktiLink) : null;
  const buktiPembayaran = bukti?.type === "bukti_pembayaran" ? bukti.bukti : null;
  // The order this Tagihan is for, and what it agreed to bear: the same facts the
  // Pencairan run will read, so this screen and the run cannot disagree.
  const pemesananOrder = tagihan.nomorPemesanan ? await pemesanan.pembayaranOrder(tagihan.nomorPemesanan) : null;
  const lokasiId = pemesananOrder?.lokasi.id ?? "";
  // Whether this Tagihan can still be paid, or replaced, is Billing's own answer, counted with the Clock.
  const bisaDibayar = dokumen?.type === "tagihan" && dokumen.notPayableBecause === null;

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
          <div className="flex flex-wrap items-center gap-3">
            <Link href={documentPagePath(buktiPembayaran.link)} className={buttonVariants({ variant: "outline" })}>
              Lihat Bukti Pembayaran
            </Link>
            <Link
              href={`/staf/admin-platform/tagihan/${tagihan.id}/bukti`}
              className={cn(buttonVariants({ variant: "ghost" }), "text-brand")}
            >
              Lihat bukti pembayaran yang diunggah
            </Link>
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Catat pembayaran manual"
        description="Transfer manual atau tunai yang diterima Operator di luar pembayaran online. Wajib ada berkas bukti, dan pencatatan ini tercatat di Audit Log."
      >
        <PembayaranManualForm tagihanId={tagihan.id} total={tagihan.total} bisaDibayar={bisaDibayar} />
      </FormSection>

      <FormSection
        title="Harga Khusus"
        description="Pengurangan untuk keluarga, dicatat beserta alasannya. Tagihan ini tidak diedit: Tagihan lama dibatalkan dan diganti Tagihan baru yang memuat baris pengurangannya, dengan jatuh tempo yang sama."
      >
        {tagihan.nomorPemesanan && pemesananOrder ? (
          <>
            <p className="text-small text-muted-foreground">
              Pesanan {tagihan.nomorPemesanan} di {pemesananOrder.lokasi.name}
              {pemesananOrder.pembayaran.kind === "langsung_ke_lokasi_mitra"
                ? ". Pembayarannya diterima langsung oleh Lokasi Mitra, jadi tidak ada tarif Pencairan untuk pesanan ini dan biaya layanan platform menjadi Potongan."
                : pemesananOrder.pembayaran.kind === "tanpa_pembayaran"
                  ? ". Seluruh Tagihannya diberikan sebagai Harga Khusus, jadi tidak ada uang yang masuk ke Operator: tidak ada tarif Pencairan dan tidak ada Potongan untuk pesanan ini."
                  : "."}
              {pemesananOrder.partnerShare > 0
                ? ` Lokasi Mitra menanggung ${formatRupiah(pemesananOrder.partnerShare)} dari pengurangan sebelumnya.`
                : ""}
            </p>
            <HargaKhususForm
              tagihanId={tagihan.id}
              nomorPemesanan={tagihan.nomorPemesanan}
              lokasiId={lokasiId}
              total={tagihan.total}
              partnerShare={pemesananOrder.partnerShare}
              bisaDiubah={bisaDibayar}
            />
          </>
        ) : (
          <p className="text-body text-muted-foreground">
            Tagihan ini bukan milik sebuah Pemesanan Makam, jadi tidak ada pesanan yang bisa diberi Harga Khusus.
          </p>
        )}
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
