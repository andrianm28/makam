import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cardSurface } from "@/components/ui/card";
import {
  documentLinkSchema,
  type BillingDocument,
  type BuktiPemesanan,
  type BuktiPerpanjangan,
  type BuktiPembayaran,
  type NotPayable,
  type DocumentHeader,
  type Tagihan,
  type TagihanLine,
} from "@/domain/billing";
import type { DokumenBuktiPencairan } from "@/domain/payouts";
import type { DokumenBuktiPengembalianDana } from "@/domain/refunds";
import { addresseeText, buktiPemesananHak, buktiPemesananMasa, lineProviderText, paymentMethodText, tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath, documentPdfPath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { bayarTagihan } from "./actions";

const paramsSchema = z.object({ link: documentLinkSchema });
/** Bayar's own note to the page: `?bayar=gagal` after the PaymentProvider refused the click. */
const querySchema = z.object({ bayar: z.literal("gagal").optional() });

type Document =
  | BillingDocument
  | { type: "bukti_pencairan"; pencairan: DokumenBuktiPencairan }
  | { type: "bukti_pengembalian_dana"; bukti: DokumenBuktiPengembalianDana };

async function documentOf(params: Promise<{ link: string }>): Promise<{ link: string; document: Document } | null> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return null;
  const runtime = serverRuntime();
  const document = await runtime.billing.documentByLink(parsed.data.link);
  if (document) return { link: parsed.data.link, document };
  // A Bukti Pencairan is the Payouts module's document, not Billing's: whoever it
  // was paid to opens it on the same unguessable link (spec, Billing > Pencairan run).
  const pencairan = await runtime.payouts.buktiPencairan(parsed.data.link);
  if (pencairan) return { link: parsed.data.link, document: { type: "bukti_pencairan", pencairan } };
  // A Bukti Pengembalian Dana is the Refunds module's document (ticket 31), same idea.
  const pengembalian = await runtime.refunds.buktiPengembalianDana(parsed.data.link);
  return pengembalian && { link: parsed.data.link, document: { type: "bukti_pengembalian_dana", bukti: pengembalian } };
}

function documentTitle(document: Document): string {
  switch (document.type) {
    case "tagihan":
      return `Tagihan ${document.tagihan.nomorTagihan}`;
    case "bukti_pembayaran":
      return `Bukti Pembayaran ${document.bukti.nomorBukti}`;
    case "bukti_pemesanan":
      return `Bukti Pemesanan ${document.bukti.nomor}`;
    case "bukti_perpanjangan":
      return `Bukti Perpanjangan ${document.bukti.nomor}`;
    case "bukti_pencairan":
      return `Bukti Pencairan ${document.pencairan.nomorBukti}`;
    case "bukti_pengembalian_dana":
      return `Bukti Pengembalian Dana ${document.bukti.nomor}`;
  }
}

export async function generateMetadata({ params }: PageProps<"/dokumen/[link]">): Promise<Metadata> {
  const found = await documentOf(params);
  const title = found ? documentTitle(found.document) : "Dokumen tidak ditemukan";
  // A document's link is its only key: never indexed, never followed.
  return { title: `${title} · Makam.co.id`, robots: { index: false, follow: false } };
}

/**
 * A Tagihan or Bukti Pembayaran on its unguessable link: anyone holding the
 * link may read it (and pay, for a Tagihan). Plain and print-friendly, since
 * "Unduh PDF" prints this very page.
 */
export default async function DokumenPage({ params, searchParams }: PageProps<"/dokumen/[link]">) {
  const found = await documentOf(params);
  if (!found) notFound();
  const { link, document } = found;
  const bayarGagal = querySchema.catch({}).parse(await searchParams).bayar === "gagal";

  return (
    // The brand sans (Plus Jakarta Sans, loaded by the root layout), so the page and its PDF read the same everywhere.
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 font-sans text-sm print:max-w-none print:p-0">
      <style>{"@page { size: A4; margin: 16mm; }"}</style>
      <div className="flex justify-end print:hidden">
        <a href={documentPdfPath(link)} download className={buttonVariants({ variant: "outline" })}>
          Unduh PDF
        </a>
      </div>
      <article className={cn(cardSurface, "flex flex-col gap-6 p-6 sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none")}>
        {document.type === "tagihan" ? (
          <TagihanView
            link={link}
            tagihan={document.tagihan}
            notPayableBecause={document.notPayableBecause}
            buktiLink={document.buktiLink}
            bayarGagal={bayarGagal}
          />
        ) : document.type === "bukti_pembayaran" ? (
          <BuktiView bukti={document.bukti} />
        ) : document.type === "bukti_pemesanan" ? (
          <BuktiPemesananView bukti={document.bukti} />
        ) : document.type === "bukti_perpanjangan" ? (
          <BuktiPerpanjanganView bukti={document.bukti} />
        ) : document.type === "bukti_pengembalian_dana" ? (
          <BuktiPengembalianDanaView bukti={document.bukti} />
        ) : document.pencairan.type === "bukti_pencairan" ? (
          <BuktiPencairanView bukti={document.pencairan} />
        ) : (
          <BuktiPencairanMitraJasaView bukti={document.pencairan} />
        )}
      </article>
    </main>
  );
}

function TagihanView({
  link,
  tagihan,
  notPayableBecause,
  buktiLink,
  bayarGagal,
}: {
  link: string;
  tagihan: Tagihan;
  notPayableBecause: NotPayable | null;
  buktiLink: string | null;
  bayarGagal: boolean;
}) {
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
      {notPayableBecause === "batas_pembayaran_lewat" ? (
        <p className="rounded-lg border border-dashed px-4 py-3">
          Batas pembayaran Tagihan ini sudah lewat, sehingga tidak bisa dibayar lagi.
        </p>
      ) : null}
      {tagihan.pengembalianDiminta && tagihan.nomorPemesanan ? (
        <p className="rounded-lg border border-dashed px-4 py-3 print:hidden">
          Dana sebesar {formatRupiah(tagihan.pengembalianDiminta.jumlah)} akan dikembalikan. Pemesan mengisi rekening tujuan{" "}
          <a href={`/pesanan/${tagihan.nomorPemesanan}`} className="text-brand underline">
            di halaman pesanan setelah masuk ke akun
          </a>
          .
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
      {bayarGagal ? (
        <p role="alert" className="rounded-lg border border-dashed px-4 py-3 print:hidden">
          Pembayaran sedang tidak bisa dimulai, coba lagi.
        </p>
      ) : null}
      {notPayableBecause === null ? <BayarForm link={link} total={tagihan.total} /> : null}
      {buktiLink ? (
        <div className="print:hidden">
          <a href={documentPagePath(buktiLink)} className={buttonVariants({ variant: "outline" })}>
            Lihat Bukti Pembayaran
          </a>
        </div>
      ) : null}
      <p className="text-muted-foreground">
        {tagihan.kind === "pay_after"
          ? "Tagihan ini dibayar setelah pemakaman. Pembayaran boleh dilakukan oleh siapa saja yang memegang tautan tagihan ini."
          : "Mohon dibayar sebelum jatuh tempo. Bila belum dibayar sampai waktu itu, tagihan ini batal dengan sendirinya. Pembayaran boleh dilakukan oleh siapa saja yang memegang tautan tagihan ini."}
      </p>
      <DocumentFoot header={tagihan.header} />
    </>
  );
}

/** The Bukti Pengembalian Dana (CONTEXT.md): the Operator's record of a refund transfer, referencing the Tagihan it partly or fully reverses. */
function BuktiPengembalianDanaView({ bukti }: { bukti: DokumenBuktiPengembalianDana }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Pengembalian Dana" number={bukti.nomor} status="Ditransfer" />
      <Facts
        facts={[
          ["Untuk Tagihan", bukti.nomorTagihan],
          ["Nomor Pemesanan", bukti.nomorPemesanan],
          ["Tanggal transfer", formatTanggal(`${bukti.ditransferPada}T00:00`)],
          ["Rekening tujuan", `${bukti.rekening.bank} · ****${bukti.rekening.nomor.slice(-4)} a.n. ${bukti.rekening.nama}`],
        ]}
      />
      <BuktiTable
        caption="Baris yang dikembalikan"
        rows={bukti.lines.map((line) => [line.label, formatRupiah(line.amount)])}
        total={formatRupiah(bukti.amount)}
        totalLabel="Total dikembalikan"
      />
      <p className="text-muted-foreground">
        {bukti.biayaLayananPlatformDikembalikan
          ? "Biaya Layanan Platform pada Tagihan ini termasuk dalam pengembalian."
          : "Biaya Layanan Platform pada Tagihan ini tidak termasuk dalam pengembalian."}
      </p>
      {bukti.buktiTransferUrl ? (
        <div className="print:hidden">
          <a href={bukti.buktiTransferUrl} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "outline" })}>
            Lihat bukti transfer
          </a>
        </div>
      ) : null}
      <DocumentFoot header={bukti.header} />
    </>
  );
}

/** Bayar: on to the payment page (Virtual Account or QRIS). Never printed. */
function BayarForm({ link, total }: { link: string; total: number }) {
  return (
    <form action={bayarTagihan} className="flex flex-col gap-2 print:hidden sm:items-start">
      <input type="hidden" name="link" value={link} />
      <Button type="submit" size="lg" className="px-6">
        Bayar {formatRupiah(total)}
      </Button>
      <p className="text-xs text-muted-foreground">
        Bayar dengan QRIS. Bila Anda baru saja membayar, status Tagihan ini berubah menjadi Lunas
        setelah pembayaran kami terima; muat ulang halaman ini sebentar lagi.
      </p>
    </form>
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

/** The Bukti Pencairan a Lokasi Mitra reads: every item it covers, less the Potongan netted. */
function BuktiPencairanView({ bukti }: { bukti: Extract<DokumenBuktiPencairan, { type: "bukti_pencairan" }> }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Pencairan" number={bukti.nomorBukti} status="Lunas" />
      <Facts
        facts={[
          ["Untuk", `Lokasi Mitra ${bukti.recipient.nama}`],
          ["Tanggal transfer", formatTanggal(`${bukti.ditransferPada}T00:00`)],
          ["Jumlah ditransfer", formatRupiah(bukti.amount)],
        ]}
      />
      <BuktiTable
        caption="Pencairan"
        rows={bukti.items.map((item) => [item.label, formatRupiah(item.amount)])}
        total={formatRupiah(bukti.items.reduce((sum, item) => sum + item.amount, 0))}
        totalLabel="Total Pencairan"
      />
      {bukti.potongan.length > 0 ? (
        <BuktiTable
          caption="Potongan"
          rows={bukti.potongan.map((entry) => [entry.alasan, `−${formatRupiah(entry.amount)}`])}
          total={`−${formatRupiah(bukti.potongan.reduce((sum, entry) => sum + entry.amount, 0))}`}
          totalLabel="Total Potongan"
        />
      ) : null}
      <p className="text-muted-foreground">
        Bukti ini mencatat satu transfer bank dan semua pekerjaan yang dicakupnya. Potongan yang mengurangi transfer ini tercantum di atas.
      </p>
      <DocumentFoot header={bukti.header} />
    </>
  );
}

/**
 * The Mitra Jasa version of the same document: the job, the Layanan, the date and
 * the rate only (spec, story 181). The data it is handed has no other field, so
 * nothing else about the order can be printed here even by mistake.
 */
function BuktiPencairanMitraJasaView({ bukti }: { bukti: Extract<DokumenBuktiPencairan, { type: "bukti_pencairan_mitra_jasa" }> }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Pencairan" number={bukti.nomorBukti} status="Lunas" />
      <Facts
        facts={[
          ["Untuk", `Mitra Jasa ${bukti.recipient.nama}`],
          ["Tanggal transfer", formatTanggal(`${bukti.ditransferPada}T00:00`)],
          ["Jumlah ditransfer", formatRupiah(bukti.amount)],
        ]}
      />
      <BuktiTable
        caption="Pekerjaan"
        rows={bukti.pekerjaan.map((pekerjaan) => [
          [
            pekerjaan.layanan ? `${pekerjaan.pekerjaan} · ${pekerjaan.layanan}` : pekerjaan.pekerjaan,
            pekerjaan.tanggal ? ` · ${formatTanggal(`${pekerjaan.tanggal}T00:00`)}` : "",
          ].join(""),
          formatRupiah(pekerjaan.tarif),
        ])}
        total={formatRupiah(bukti.pekerjaan.reduce((sum, pekerjaan) => sum + pekerjaan.tarif, 0))}
        totalLabel="Total"
      />
      <p className="text-muted-foreground">Bukti ini memuat pekerjaan, Layanan, tanggal, dan tarif yang dibayarkan.</p>
      <DocumentFoot header={bukti.header} />
    </>
  );
}

/**
 * The Bukti Pemesanan (CONTEXT.md): the proof of the Hak Pakai a paid Pemesanan
 * Makam bought, in the Lokasi Mitra's name. It names the right and nothing else —
 * no amounts, because the money has its own Bukti Pembayaran — and the Lokasi's
 * "Petunjuk arah" link, so a family can find the gate again.
 */
function BuktiPemesananView({ bukti }: { bukti: BuktiPemesanan }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Pemesanan" number={bukti.nomor} status="Diterbitkan" />
      <Facts
        facts={[
          ["Nomor Pemesanan", bukti.nomorPemesanan],
          ["Lokasi Mitra", bukti.lokasiName],
          ["Petak Makam", bukti.petakNomor],
          ["Pemegang Hak", bukti.pemegangHakName],
          // The row and the sentence below read this one masa, so the two cannot
          // disagree about whether the right has an end (a fixed term is never
          // called limitless; see `buktiPemesananHak`).
          ["Masa Hak Pakai", buktiPemesananMasa(bukti.masa)],
          ["Tanggal terbit", formatTanggalJam(bukti.issuedAt)],
        ]}
      />
      <p className="text-muted-foreground" data-testid="bukti-pemesanan-hak">
        {buktiPemesananHak(bukti, bukti.masa)}
      </p>
      {bukti.petunjukArah ? (
        <div className="print:hidden">
          <a href={bukti.petunjukArah} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "outline" })}>
            Petunjuk arah ke {bukti.lokasiName}
          </a>
        </div>
      ) : null}
      <DocumentFoot header={bukti.header} />
    </>
  );
}

/**
 * The Bukti Perpanjangan (CONTEXT.md): the proof a Hak Pakai was extended, in the
 * Lokasi Mitra's name, with the old and the new end dates and the terms bought.
 * Like the Bukti Pemesanan it carries no amounts: the money has its own Bukti Pembayaran.
 */
function BuktiPerpanjanganView({ bukti }: { bukti: BuktiPerpanjangan }) {
  return (
    <>
      <DocumentTop header={bukti.header} title="Bukti Perpanjangan" number={bukti.nomor} status="Diterbitkan" />
      <Facts
        facts={[
          ["Lokasi Mitra", bukti.lokasiName],
          ["Petak Makam", bukti.petakNomor],
          ["Pemegang Hak", bukti.pemegangHakName],
          ["Masa berlaku sebelumnya sampai", formatTanggal(bukti.endDateLama)],
          ["Masa berlaku sekarang sampai", formatTanggal(bukti.endDateBaru)],
          ["Masa dibeli", `${bukti.terms} masa`],
          ["Tanggal terbit", formatTanggalJam(bukti.issuedAt)],
        ]}
      />
      <p className="text-muted-foreground" data-testid="bukti-perpanjangan-hak">
        {bukti.lokasiName} memperpanjang Hak Pakai {bukti.pemegangHakName} atas {bukti.petakNomor} sampai {formatTanggal(bukti.endDateBaru)}.
      </p>
      <DocumentFoot header={bukti.header} />
    </>
  );
}

/** One table of a Bukti Pencairan: a caption, its lines, and what they come to. */
function BuktiTable({
  caption,
  rows,
  total,
  totalLabel,
}: {
  caption: string;
  rows: [string, string][];
  total: string;
  totalLabel: string;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="pb-2 text-left text-base font-semibold">{caption}</caption>
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
        {rows.map(([label, jumlah]) => (
          <tr key={label} className="border-b">
            <td className="py-2 pr-4">{label}</td>
            <td className="py-2 text-right whitespace-nowrap tabular-nums">{jumlah}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-3 pr-4 font-semibold">
            {totalLabel}
          </th>
          <td className="pt-3 text-right text-base font-semibold whitespace-nowrap tabular-nums">{total}</td>
        </tr>
      </tfoot>
    </table>
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
