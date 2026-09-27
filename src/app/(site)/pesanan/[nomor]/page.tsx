import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Check } from "lucide-react";
import { CatatanPembayaran } from "@/components/makam/catatan-pembayaran";
import { StatusBadge, statusVocabulary } from "@/components/makam/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { authorize, pemesananResource } from "@/domain/identity";
import type { PemesananOrder } from "@/domain/pemesanan";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { UnggahDokumenForm } from "./unggah-dokumen-form";
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/**
 * One Pemesanan Makam on its Nomor Pemesanan (spec, story 28): the status
 * timeline, when the Lokasi will confirm at the latest, and what was ordered.
 * Only the Pemesan who placed it may read it, through the guard's
 * `pemesanan.lihat` on their own orders.
 */
export async function generateMetadata({ params }: PageProps<"/pesanan/[nomor]">): Promise<Metadata> {
  const parsed = nomorSchema.safeParse((await params).nomor);
  return {
    title: parsed.success ? `Pesanan ${parsed.data} · Makam.co.id` : "Pesanan tidak ditemukan · Makam.co.id",
    // An order is one family's business: never indexed, never followed.
    robots: { index: false, follow: false },
  };
}

export default async function PesananPage({ params }: PageProps<"/pesanan/[nomor]">) {
  const order = await orderFor(params);
  if (!order) notFound();
  const { billing, lokasi } = serverRuntime();
  // The confirmation's own facts: the Tagihan it was issued with, whom the family may call, and the
  // payment window that Lokasi Mitra itself sets (so the note names the order's own deadline).
  const tagihan = order.tagihanId ? await billing.tagihan(order.tagihanId) : null;
  const kontak = order.pemakaman ? await lokasi.kontakSiagaOf(order.lokasi.id) : null;
  const jumlahJamPembayaran = await lokasi.saatDukaPaymentWindowHours(order.lokasi.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">Pesanan terkirim</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan{" "}
          <span className="font-mono font-semibold text-foreground" data-testid="nomor-pemesanan">
            {order.nomor}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {order.pemakaman ? <Dikonfirmasi order={order} tagihan={tagihan} kontak={kontak} /> : order.konfirmasiDueAt ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="konfirmasi-paling-lambat">
          <span className="font-semibold">{order.lokasi.name}</span> mengonfirmasi paling lambat {formatTanggalJam(order.konfirmasiDueAt)}.
          Statusnya bisa Anda ikuti di halaman ini, dan kabar ini datang ke email Anda.
        </p>
      ) : (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
          {order.lokasi.name} belum membuka jam operasionalnya. Begitu ada, Lokasi Mitra mengonfirmasi pesanan ini dan
          statusnya berubah di halaman ini.
        </p>
      )}

      {order.pemakaman ? null : <CatatanPembayaran jumlahJam={jumlahJamPembayaran} />}

      <Timeline order={order} />

      {order.dokumen.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-3 text-foreground">Dokumen yang diminta</h2>
          <p className="text-small text-muted-foreground">
            Dokumen boleh menyusul, bahkan setelah pemakaman. Yang tidak boleh delaying pemakaman adalah pembayaran, dan
            Tagihan pun tidak menahannya.
          </p>
          <ul className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
            {order.dokumen.map((dokumen) => (
              <li key={dokumen.nama} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{dokumen.nama}</span>
                <span className="text-small text-muted-foreground">
                  {dokumen.dicentang ? "Sudah diterima Lokasi Mitra" : dokumen.diunggah ? "Sudah diunggah" : "Belum diunggah"}
                </span>
              </li>
            ))}
          </ul>
          <UnggahDokumenForm nomor={order.nomor} nama={order.dokumen.map((dokumen) => dokumen.nama)} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Yang dipesan</h2>
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
          <Baris label="Lokasi Mitra" value={order.lokasi.name} href={`/lokasi/${order.lokasi.id}`} />
          {order.jenisMakam ? <Baris label="Jenis Makam" value={order.jenisMakam.name} /> : null}
          <Baris label="Almarhum" value={`${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}`} />
          <Baris
            label="Pemegang Hak"
            value={
              order.pemegangHak.mode === "pemesan"
                ? `${order.pemegangHak.name} (Pemesan)`
                : `${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`
            }
          />
          <Baris label="Pemesan" value={`${order.pemesan.name}${order.pemesan.email ? ` · ${order.pemesan.email}` : ""}`} />
          {order.pemesan.phoneNumber ? <Baris label="Telepon Pemesan" value={order.pemesan.phoneNumber} /> : null}
          {order.rencanaPemakamanAt ? <Baris label="Rencana pemakaman" value={formatTanggalJam(order.rencanaPemakamanAt)} /> : null}
          {order.keinginanPenempatan ? <Baris label="Keinginan penempatan" value={order.keinginanPenempatan} /> : null}
        </dl>
      </section>

      <Link href="/akun" className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
        Lihat pesanan saya di Akun Saya
      </Link>
    </main>
  );
}

/**
 * The order, for its own Pemesan only. A visitor with no session is sent to
 * Masuk (the Kode Masuk that placed the order is the same one that signs them
 * in); a signed-in account that is not the Pemesan is told nothing found, as
 * any other order is.
 */
async function orderFor(params: Promise<{ nomor: string }>): Promise<PemesananOrder | null> {
  const parsed = nomorSchema.safeParse((await params).nomor);
  if (!parsed.success) return null;
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (!authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed) return null;
  return serverRuntime().pemesanan.orderOf(parsed.data, { accountId: actor.accountId });
}

/**
 * The confirmation (spec, story 29): the Petak Makam the Lokasi assigned, the
 * contact to call, the Tagihan's deadline, and the promise that the burial goes
 * ahead whatever the payment does.
 */
function Dikonfirmasi({
  order,
  tagihan,
  kontak,
}: {
  order: PemesananOrder;
  tagihan: Awaited<ReturnType<ReturnType<typeof serverRuntime>["billing"]["tagihan"]>>;
  kontak: Awaited<ReturnType<ReturnType<typeof serverRuntime>["lokasi"]["kontakSiagaOf"]>>;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid="pesanan-dikonfirmasi">
      <h2 className="text-title-3 text-foreground">Pesanan sudah dikonfirmasi</h2>
      <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
        <Baris label="Petak Makam" value={order.pemakaman?.petakNomor ?? "menyusul"} />
        <Baris label="Pemakaman" value={order.pemakaman ? formatTanggalJam(order.pemakaman.at) : "menyusul"} />
        <Baris label="Lokasi Mitra" value={order.lokasi.name} href={`/lokasi/${order.lokasi.id}`} />
        <Baris
          label="Hubungi Lokasi Mitra"
          value={kontak ? [kontak.name, kontak.phoneNumber].filter(Boolean).join(" · ") || order.lokasi.name : order.lokasi.name}
        />
        {tagihan ? (
          <>
            <Baris label="Tagihan" value={tagihan.nomorTagihan} />
            <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
          </>
        ) : null}
      </dl>
      <p className="rounded-xl bg-success-soft px-4 py-3 text-body text-success-soft-foreground">
        Pemakaman tetap berjalan walaupun pembayaran belum masuk. Dokumen boleh menyusul setelah pemakaman.
      </p>
    </section>
  );
}

/**
 * The order's status timeline: the steps the Pemesanan module says this order
 * runs through, with the ones it has reached ticked. Which step that is belongs
 * to the module, not to this screen.
 */
function Timeline({ order }: { order: PemesananOrder }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title-3 text-foreground">Status pesanan</h2>
      <ol className="flex flex-col gap-2">
        {order.langkah.map((step) => (
          <li key={step.status} className="flex items-center gap-3 text-body">
            <span
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                step.tercapai ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
              )}
              aria-hidden
            >
              {step.tercapai ? <Check className="size-3.5" /> : null}
            </span>
            <span className={cn(step.tercapai ? "font-medium text-foreground" : "text-muted-foreground")}>
              {statusVocabulary[step.status].label}
            </span>
          </li>
        ))}
      </ol>
      {order.alasan ? <p className="text-small text-muted-foreground">Alasan: {order.alasan}</p> : null}
    </section>
  );
}

function Baris({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">
        {href ? (
          <Link href={href} className="underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
