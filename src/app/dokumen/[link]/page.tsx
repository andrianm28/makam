import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { documentLinkSchema, type BillingDocument, type BuktiPembayaran, type DocumentHeader, type Tagihan, type TagihanLine } from "@/domain/billing";
import { addresseeText, lineProviderText, paymentMethodText, tagihanStatusText } from "@/lib/billing-labels";
import { documentPdfPath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";

const paramsSchema = z.object({ link: documentLinkSchema });

async function documentOf(params: Promise<{ link: string }>): Promise<{ link: string; document: BillingDocument } | null> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return null;
  const document = await serverRuntime().billing.documentByLink(parsed.data.link);
  return document && { link: parsed.data.link, document };
}

export async function generateMetadata({ params }: PageProps<"/dokumen/[link]">): Promise<Metadata> {
  const found = await documentOf(params);
  const title = !found
    ? "Dokumen tidak ditemukan"
    : found.document.type === "tagihan"
      ? `Tagihan ${found.document.tagihan.nomorTagihan}`
      : `Bukti Pembayaran ${found.document.bukti.nomorBukti}`;
  // A document's link is its only key: never indexed, never followed.
  return { title: `${title} · Makam.co.id`, robots: { index: false, follow: false } };
}

/**
 * A Tagihan or Bukti Pembayaran on its unguessable link: anyone holding the
 * link may read it (and pay, for a Tagihan). Plain and print-friendly, since
 * "Unduh PDF" prints this very page.
 */
export default async function DokumenPage({ params }: PageProps<"/dokumen/[link]">) {
  const found = await documentOf(params);
  if (!found) notFound();
  const { link, document } = found;

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 text-sm print:max-w-none print:p-0"
      // The app's own sans (Geist, loaded by the root layout), so the page and its PDF read the same everywhere.
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <style>{"@page { size: A4; margin: 16mm; }"}</style>
      <div className="flex justify-end print:hidden">
        <a href={documentPdfPath(link)} download className={buttonVariants({ variant: "outline" })}>
          Unduh PDF
        </a>
      </div>
      <article className="flex flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground sm:p-10 print:rounded-none print:border-0 print:p-0">
        {document.type === "tagihan" ? <TagihanView tagihan={document.tagihan} /> : <BuktiView bukti={document.bukti} />}
      </article>
    </main>
  );
}

function TagihanView({ tagihan }: { tagihan: Tagihan }) {
  return (
    <>
      <DocumentTop header={tagihan.header} title="Tagihan" number={tagihan.nomorTagihan} status={tagihanStatusText(tagihan.status)} />
      {tagihan.status === "dibatalkan" ? (
        <p className="rounded-lg border border-dashed px-4 py-3">
          {tagihan.cancelledReason === "diganti" && tagihan.replacedByNomorTagihan
            ? `Tagihan ini sudah dibatalkan dan diganti dengan Tagihan ${tagihan.replacedByNomorTagihan}. Silakan gunakan tagihan yang baru.`
            : "Tagihan ini sudah dibatalkan karena batas pembayarannya lewat, sehingga tidak bisa dibayar lagi."}
        </p>
      ) : null}
      <Facts
        facts={[
          [addresseeText("tagihan", tagihan.addressee.role), tagihan.addressee.name],
          ["Nomor Pemesanan", tagihan.nomorPemesanan],
          ["Lokasi", tagihan.placeName],
          ["Tanggal terbit", formatTanggalJam(tagihan.issuedAt)],
          ["Jatuh tempo", formatTanggalJam(tagihan.dueAt)],
          ["Menggantikan", tagihan.replacesNomorTagihan && `Tagihan ${tagihan.replacesNomorTagihan}`],
        ]}
      />
      <Lines lines={tagihan.lines} total={tagihan.total} totalLabel="Total tagihan" />
      <p className="text-muted-foreground">
        {tagihan.kind === "pay_after"
          ? "Tagihan ini dibayar setelah pemakaman. Pembayaran boleh dilakukan oleh siapa saja yang memegang tautan tagihan ini."
          : "Mohon dibayar sebelum jatuh tempo. Bila belum dibayar sampai waktu itu, tagihan ini batal dengan sendirinya. Pembayaran boleh dilakukan oleh siapa saja yang memegang tautan tagihan ini."}
      </p>
      <DocumentFoot header={tagihan.header} />
    </>
  );
}

function BuktiView({ bukti }: { bukti: BuktiPembayaran }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Pembayaran" number={bukti.nomorBukti} status="Lunas" />
      <Facts
        facts={[
          ["Untuk Tagihan", bukti.tagihan.nomorTagihan],
          [addresseeText("bukti_pembayaran", bukti.tagihan.addressee.role), bukti.tagihan.addressee.name],
          ["Nomor Pemesanan", bukti.tagihan.nomorPemesanan],
          ["Lokasi", bukti.tagihan.placeName],
          ["Waktu pembayaran", formatTanggalJam(bukti.paidAt)],
          ["Metode", paymentMethodText(bukti.method)],
          ["Referensi", bukti.reference],
          ["Jumlah diterima", formatRupiah(bukti.amount)],
        ]}
      />
      <Lines lines={bukti.tagihan.lines} total={bukti.amount} totalLabel="Total dibayar" />
      <p className="text-muted-foreground">Terima kasih. Pembayaran untuk Tagihan {bukti.tagihan.nomorTagihan} sudah kami terima dengan baik.</p>
      <DocumentFoot header={bukti.header} />
    </>
  );
}

function DocumentTop({ header, title, number, status }: { header: DocumentHeader; title: string; number: string; status: string }) {
  return (
    <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold tracking-tight">Makam.co.id</p>
        <p className="font-medium">{header.legalName}</p>
        <p className="whitespace-pre-line text-muted-foreground">{header.address}</p>
        <p className="text-muted-foreground">
          {header.phone} · {header.email}
        </p>
      </div>
      <div className="flex flex-col gap-1 sm:items-end sm:text-right">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="font-mono">{number}</p>
        <Badge variant="outline">{status}</Badge>
      </div>
    </header>
  );
}

function Facts({ facts }: { facts: [string, string | null][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {facts
        .filter((fact): fact is [string, string] => fact[1] !== null)
        .map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Lines({ lines, total, totalLabel }: { lines: TagihanLine[]; total: number; totalLabel: string }) {
  return (
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
        {lines.map((line, index) => (
          <tr key={index} className="border-b align-top">
            <td className="py-2 pr-4">
              <span className="block">{line.label}</span>
              <span className="block text-xs text-muted-foreground">
                {line.kind === "penyesuaian_harga_khusus" ? "Harga Khusus untuk pesanan ini" : `Oleh ${lineProviderText(line.provider)}`}
                {line.kind === "layanan" ? ` · untuk ${formatTanggal(line.targetDate)}` : ""}
              </span>
            </td>
            <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatRupiah(line.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-3 pr-4 font-semibold">
            {totalLabel}
          </th>
          <td className="pt-3 text-right text-base font-semibold whitespace-nowrap tabular-nums">{formatRupiah(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function DocumentFoot({ header }: { header: DocumentHeader }) {
  return (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      Dokumen ini diterbitkan oleh {header.legalName} melalui Makam.co.id. Siapa pun yang memegang tautan dokumen ini dapat
      membukanya, jadi bagikan hanya kepada keluarga yang perlu.
    </footer>
  );
}
