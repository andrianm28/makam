import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Check } from "lucide-react";
import { StatusBadge, statusVocabulary } from "@/components/makam/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { authorize, pemesananResource } from "@/domain/identity";
import type { PemesananOrder } from "@/domain/pemesanan";
import { pemesananStatusKey } from "@/lib/pemesanan-labels";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
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
          <StatusBadge status={pemesananStatusKey(order.status)} />
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {order.konfirmasiDueAt ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="konfirmasi-paling-lambat">
          <span className="font-semibold">{order.lokasi.name}</span> mengonfirmasi paling lambat {formatTanggalJam(order.konfirmasiDueAt)}.
          Kabar berikutnya kami kirim ke email Anda.
        </p>
      ) : (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
          {order.lokasi.name} belum membuka jam operasionalnya. Begitu ada, Lokasi Mitra mengonfirmasi pesanan ini dan kami
          mengabari lewat email Anda.
        </p>
      )}

      <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
        Belum ada yang dibayar. Tagihan terbit setelah Lokasi Mitra mengonfirmasi, dan jatuh tempo 3×24 jam setelah
        pemakaman. Dokumen boleh menyusul.
      </p>

      <Timeline order={order} />

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

/** The statuses this kind of order runs through, with the ones behind the current one marked as reached. */
function Timeline({ order }: { order: PemesananOrder }) {
  const sampai = order.track.indexOf(order.status);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title-3 text-foreground">Status pesanan</h2>
      <ol className="flex flex-col gap-2">
        {order.track.map((status, index) => {
          const tercapai = index <= sampai && sampai >= 0;
          return (
            <li key={status} className="flex items-center gap-3 text-body">
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  tercapai ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                )}
                aria-hidden
              >
                {tercapai ? <Check className="size-3.5" /> : null}
              </span>
              <span className={cn(tercapai ? "font-medium text-foreground" : "text-muted-foreground")}>
                {statusVocabulary[pemesananStatusKey(status)].label}
              </span>
            </li>
          );
        })}
      </ol>
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
