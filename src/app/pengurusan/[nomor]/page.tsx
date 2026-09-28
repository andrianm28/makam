import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Clock, MoonStar } from "lucide-react";
import { StatusBadge } from "@/components/makam/status-badge";
import { csWhatsAppLink } from "@/components/kode-masuk/state";
import { authorize, pemesananResource } from "@/domain/identity";
import { isOpenAt, TPU_SCHEDULE } from "@/domain/lokasi";
import type { PengurusanOrder } from "@/domain/pengurusan";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

export async function generateMetadata({ params }: PageProps<"/pengurusan/[nomor]">): Promise<Metadata> {
  const parsed = nomorSchema.safeParse((await params).nomor);
  return {
    title: parsed.success ? `Pengurusan ${parsed.data} · Makam.co.id` : "Pengurusan tidak ditemukan · Makam.co.id",
    // One family's business: never indexed, never followed.
    robots: { index: false, follow: false },
  };
}

/**
 * Where a Saat Duka TPU submission lands (spec, story 72: "As a Pemesan
 * submitting at night, I want the computed confirmation time shown, the CS
 * WhatsApp and its reply hours, and a note that I can go to the TPU directly and
 * still have the IPTM filed later"): the Nomor Pemesanan, when the Operator
 * confirms by — two service hours on the TPU window, so 23:00 becomes 08:00 —
 * both document sets, and, for a submission made outside that window, the CS
 * WhatsApp with the hours it answers and the note that the family may go to the
 * TPU itself and still have the IPTM filed later.
 *
 * The confirmation itself, its contacts and the Tagihan are ticket 45's; this
 * page shows the order as it stands right after Kirim.
 */
export default async function PengurusanPage({ params }: PageProps<"/pengurusan/[nomor]">) {
  const order = await orderFor(params);
  if (!order) notFound();
  const { operatorSettings } = serverRuntime();
  const pengaturan = await operatorSettings.current();
  const cs = pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null;
  // The TPU window as it stood when this order was submitted: outside it the
  // family is waiting for the morning, and that is the case story 72 is about.
  const malam = !isOpenAt(TPU_SCHEDULE, order.diajukanAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">Pengurusan terkirim</h1>
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

      {order.konfirmasiDueAt ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="konfirmasi-paling-lambat">
          <span className="flex items-start gap-2">
            <Clock className="mt-1 size-4 shrink-0" aria-hidden />
            <span>
              Kami mengonfirmasi pemakaman di <span className="font-semibold">{order.tpu.name}</span> paling lambat{" "}
              <span className="font-semibold">{formatTanggalJam(order.konfirmasiDueAt)}</span>. Statusnya bisa Anda ikuti di
              halaman ini.
            </span>
          </span>
        </p>
      ) : (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
          Waktu konfirmasi untuk <span className="font-semibold">{order.tpu.name}</span> belum bisa dihitung. Tim kami
          mengabari lewat email, dan statusnya tetap bisa Anda ikuti di halaman ini.
        </p>
      )}

      {malam ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-body" aria-label="Pengajuan di luar jam layanan TPU">
          <p className="flex items-start gap-2">
            <MoonStar className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              Pengajuan ini masuk di luar jam layanan TPU (pukul 06.00–18.00), jadi tim kami memprosesnya pada jam layanan
              berikutnya.
            </span>
          </p>
          {cs ? (
            <p>
              Butuh lebih cepat? Hubungi CS di{" "}
              <a href={csWhatsAppLink(cs)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-4">
                WhatsApp
              </a>{" "}
              ({cs.replyHours}).
            </p>
          ) : null}
          <p className="text-small text-muted-foreground">
            Kalau keluarga memilih datang sendiri ke TPU, pemakaman tetap dapat dilaksanakan dan Anda tetap bisa mengajukan
            IPTM-nya lewat kami belakangan.
          </p>
        </section>
      ) : null}

      <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
        Belum ada yang dibayar. Tagihan terbit setelah pemakaman dikonfirmasi, dan jatuh tempo 3×24 jam setelah pemakaman.
        Dokumen boleh menyusul.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Dokumen</h2>
        <p className="text-small text-muted-foreground">
          Dua daftar berbeda. Yang pertama dibawa ke TPU pada hari pemakaman; yang kedua Anda unggah ke kami paling lambat 7
          hari setelah pemakaman, untuk kami ajukan IPTM-nya.
        </p>
        <Daftar judul="Dibawa saat pemakaman" dokumen={order.dokumen.pemakaman} />
        <Daftar judul="Diupload setelah pemakaman" dokumen={order.dokumen.pengajuan} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Yang dipesan</h2>
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
          <Baris label="TPU" value={order.tpu.name} href={`/tpu/${order.tpu.id}`} />
          <Baris label="Alamat TPU" value={order.tpu.address} />
          <Baris
            label="Jenis pemakaman"
            value={order.jenisPenguburan === "tumpang" ? "Tumpang, di makam yang sudah ada isinya" : "Makam baru"}
          />
          {order.kuburan ? <Baris label="Makam yang ditumpang" value={`${order.kuburan.blokNomor} · ${order.kuburan.nama}`} /> : null}
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
        </dl>
      </section>
    </main>
  );
}

/**
 * The order, for its own Pemesan only: a visitor with no session is sent to
 * Masuk (the Kode Masuk that placed the order is the one that signs them in), and
 * a signed-in account that is not the Pemesan is told nothing found.
 */
async function orderFor(params: Promise<{ nomor: string }>): Promise<PengurusanOrder | null> {
  const parsed = nomorSchema.safeParse((await params).nomor);
  if (!parsed.success) return null;
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (!authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed) return null;
  return serverRuntime().pengurusan.orderOf(parsed.data, { accountId: actor.accountId });
}

function Daftar({ judul, dokumen }: { judul: string; dokumen: PengurusanOrder["dokumen"]["pemakaman"] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="text-body font-medium text-foreground">{judul}</p>
      <ul className="flex flex-col gap-1.5">
        {dokumen.map((satu) => (
          <li key={satu.nama} className="text-small text-muted-foreground">
            <span className="font-medium text-foreground">{satu.nama}</span>
            {satu.catatan ? ` — ${satu.catatan}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Baris({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{href ? <a href={href} className="underline underline-offset-4">{value}</a> : value}</dd>
    </div>
  );
}
