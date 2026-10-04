import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Clock, MoonStar } from "lucide-react";
import { StatusBadge, type StatusKey } from "@/components/makam/status-badge";
import { csWhatsAppLink } from "@/components/kode-masuk/state";
import { authorize, pemesananResource } from "@/domain/identity";
import { isOpenAt, TPU_SCHEDULE } from "@/domain/lokasi";
import { KONFIRMASI_TPU_SAAT_DUKA_TYPE } from "@/domain/queues";
import type { PengurusanOrder, PengurusanTpuStatus } from "@/domain/pengurusan";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { PekerjaanTpuDaftar } from "@/app/layanan/[nomor]/pekerjaan-tpu";
import { RekeningPengembalianForm } from "@/app/(site)/pesanan/[nomor]/rekening-pengembalian-form";
import { isiRekeningPengembalianPengurusanAction } from "./pengajuan-actions";
import { JawabTpuLainForm } from "./jawab-tpu-lain";
import { PengajuanPemesan } from "./pengajuan-pemesan";
import { PengurusanIptmPemesan } from "./pengurusan-iptm-pemesan";
import { PerpanjanganTpuPemesan } from "./perpanjangan-tpu-pemesan";

/** The statuses from the confirmation on: the burial is agreed and the family follows the filing. */
const SUDAH_DIKONFIRMASI: PengurusanTpuStatus[] = ["dikonfirmasi", "dimakamkan", "dokumen_lengkap", "iptm_diajukan", "iptm_terbit"];

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
 * Where a Saat Duka TPU order lives and is followed (spec, story 72 for the
 * night submission, story 73 for the confirmation). Before the confirmation it
 * shows the Nomor Pemesanan, when the Operator confirms by, who from the office
 * is handling it, and both document sets. After it, what the family was told:
 * the agreed burial, the TPU address, the Admin Platform and TPU contacts, both
 * document lists, the price lines and the Tagihan.
 */
export default async function PengurusanPage({ params }: PageProps<"/pengurusan/[nomor]">) {
  const order = await orderFor(params);
  if (!order) notFound();
  if (order.kind === "perpanjangan_tpu") return <PerpanjanganTpuPemesan order={order} scanUrl={await scanUrlOf(order)} />;
  // A filing-only order has no burial arranged by us (ticket 47): everything below is about one, so it has a page of its own (ticket 116).
  if (order.kind === "pengurusan_iptm") return <PengurusanIptmPemesan order={order} scanUrl={await scanUrlOf(order)} pengembalian={await pengembalianOf(order)} />;
  const { operatorSettings, queues, layanan } = serverRuntime();
  const pengaturan = await operatorSettings.current();
  // The hari-H Layanan of a confirmed order are Pekerjaan Layanan a Mitra Jasa does on the burial day (ticket 56).
  const actor = await currentActor();
  const layananHariH = actor && order.status === "dikonfirmasi" ? await layanan.pesananTpuOf(order.nomor, { accountId: actor.accountId }) : null;
  const lanjut = SUDAH_DIKONFIRMASI.includes(order.status);
  const scanUrl = actor && order.status === "iptm_terbit" ? await serverRuntime().pengurusan.iptmScanUrl({ accountId: actor.accountId }, order.nomor) : null;
  // A paid order cancelled before the IPTM was filed has a refund waiting for the Pemesan's rekening.
  const pengembalian = actor && order.status === "dibatalkan" ? await serverRuntime().refunds.permintaanUntukPesanan(order.nomor) : null;
  const cs = pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null;
  // The TPU window as it stood when this order was submitted: outside it the
  // family is waiting for the morning, and that is the case story 72 is about.
  const malam = !isOpenAt(TPU_SCHEDULE, order.diajukanAt);
  // Who from the office has taken this order, as the Antrean's Ambil claim
  // records it: a name and a number the family may ring (story 73).
  const penanganan = order.tawaran || order.status === "dikonfirmasi"
    ? null
    : await queues.ambilPengurus({ type: KONFIRMASI_TPU_SAAT_DUKA_TYPE, subjectId: order.id });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">
          {lanjut ? "Pemakaman sudah dikonfirmasi" : "Pengurusan terkirim"}
        </h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan{" "}
          <span className="font-mono font-semibold text-foreground" data-testid="nomor-pemesanan">
            {order.nomor}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadgeIn order={order} />
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {order.tawaran ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Tawaran TPU lain">
          <p className="text-body">
            <span className="font-medium text-foreground">{order.tawaran.tpu.name}</span> bisa dipakai untuk pemakaman ini.{" "}
            {order.tawaran.alasan}
          </p>
          <JawabTpuLainForm nomor={order.nomor} namaTpu={order.tawaran.tpu.name} />
        </section>
      ) : null}

      {lanjut ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Hasil konfirmasi">
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Waktu pemakaman" value={formatTanggalJam(order.pemakamanAt!)} />
            <Baris label="TPU" value={order.tpu.name} href={`/tpu/${order.tpu.id}`} />
            <Baris label="Alamat TPU" value={order.tpu.address} />
            {order.kontakTpu ? <Baris label="Kontak TPU" value={`${order.kontakTpu.name}, ${order.kontakTpu.phoneNumber}`} /> : null}
            {order.adminPlatform ? (
              <Baris
                label="Admin Platform"
                value={`${order.adminPlatform.name}${order.adminPlatform.phoneNumber ? ` · ${order.adminPlatform.phoneNumber}` : ""}`}
              />
            ) : null}
          </dl>
          {order.catatanKonfirmasi ? <p className="text-body text-muted-foreground">{order.catatanKonfirmasi}</p> : null}
          {order.harga ? (
            <ul className="flex flex-col gap-1 text-body">
              {order.harga.map((line) => (
                <li key={line.label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-medium text-foreground">{formatRupiah(line.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {order.tagihan ? (
            <p className="text-body" data-testid="tagihan-konfirmasi">
              Tagihan {order.tagihan.nomor} sebesar {formatRupiah(order.tagihan.total)} jatuh tempo{" "}
              {formatTanggalJam(order.tagihan.dueAt)}.{" "}
              <a href={`/dokumen/${order.tagihan.link}`} className="font-medium text-brand underline underline-offset-4">
                Buka Tagihan
              </a>
              . Pemakaman tetap berjalan walaupun pembayaran belum masuk.
            </p>
          ) : null}
        </section>
      ) : (
        <>
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

          {penanganan ? (
            <p
              className="rounded-xl border border-border bg-card px-4 py-3 text-body"
              data-testid="admin-platform-menangani"
            >
              Yang menangani pengurusan Anda: <span className="font-semibold">{penanganan.name}</span>
              {penanganan.phoneNumber ? ` · ${penanganan.phoneNumber}` : ""}.
            </p>
          ) : null}
        </>
      )}

      {malam && !lanjut ? (
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

      <PengajuanPemesan order={order} scanUrl={scanUrl} />

      {pengembalian ? (
        pengembalian.status === "diajukan" ? (
          <RekeningPengembalianForm
            nomor={order.nomor}
            jumlahLabel={formatRupiah(pengembalian.jumlah)}
            rekeningTercatat={pengembalian.rekening ? `${pengembalian.rekening.bank} ****${pengembalian.rekening.nomor.slice(-4)}` : null}
            simpan={isiRekeningPengembalianPengurusanAction}
          />
        ) : (
          <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="rekening-pengembalian-terkunci">
            Pengembalian dana {formatRupiah(pengembalian.jumlah)} sudah disetujui dan menunggu transfer. Untuk mengubah rekening, hubungi CS.
          </p>
        )
      ) : null}

      {layananHariH ? (
        <section className="flex flex-col gap-3" aria-label="Layanan hari-H">
          <h2 className="text-title-3 text-foreground">Layanan hari-H</h2>
          <p className="text-small text-muted-foreground">Dikerjakan Mitra Jasa pada hari pemakaman, dan ditagihkan pada Tagihan di atas.</p>
          <PekerjaanTpuDaftar order={layananHariH} />
        </section>
      ) : null}

      {order.tagihan ? null : (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground">
          Belum ada yang dibayar. Tagihan terbit setelah pemakaman dikonfirmasi, dan jatuh tempo 3×24 jam setelah pemakaman.
          Dokumen boleh menyusul.
        </p>
      )}

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
          {order.jenisPenguburan ? (
            <Baris
              label="Jenis pemakaman"
              value={order.jenisPenguburan === "tumpang" ? "Tumpang, di makam yang sudah ada isinya" : "Makam baru"}
            />
          ) : null}
          {order.kuburan ? <Baris label="Makam yang ditumpang" value={`${order.kuburan.blokNomor} · ${order.kuburan.nama}`} /> : null}
          {order.almarhum ? <Baris label="Almarhum" value={`${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}`} /> : null}
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
          {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
        </dl>
      </section>
    </main>
  );
}

/** A short-lived link to the IPTM scan of an issued IPTM, for its own Pemesan. */
async function scanUrlOf(order: PengurusanOrder): Promise<string | null> {
  const actor = await currentActor();
  return actor && order.status === "iptm_terbit" ? serverRuntime().pengurusan.iptmScanUrl({ accountId: actor.accountId }, order.nomor) : null;
}

/** The refund a cancelled order that had been paid is waiting to send, for the Pemesan's rekening; null for any other order. */
async function pengembalianOf(order: PengurusanOrder) {
  const actor = await currentActor();
  return actor && order.status === "dibatalkan" ? serverRuntime().refunds.permintaanUntukPesanan(order.nomor) : null;
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

/**
 * The order's status, as the shared badge can say it. The Pengurusan module
 * knows its own eleven statuses (spec, Pengurusan), but a status the vocabulary
 * has no word for belongs to the ticket that can first reach it — Dokumen
 * Lengkap and IPTM Terbit to the filing (46), Menunggu Pembayaran, Diproses and
 * Perlu Perbaikan to Perpanjangan TPU (48) — and each of those adds its label
 * here and in `statusVocabulary` when it lands. A status with no word yet is
 * shown as nothing rather than as a word the glossary does not carry.
 */
const BADGE: Partial<Record<PengurusanTpuStatus, StatusKey>> = {
  diajukan: "diajukan",
  dikonfirmasi: "dikonfirmasi",
  dimakamkan: "dimakamkan",
  dokumen_lengkap: "dokumen_lengkap",
  menunggu_pembayaran: "menunggu_pembayaran",
  diproses: "diproses",
  perlu_perbaikan: "perlu_perbaikan",
  iptm_diajukan: "iptm_diajukan",
  iptm_terbit: "iptm_terbit",
  ditolak: "ditolak",
  dibatalkan: "dibatalkan",
};

function StatusBadgeIn({ order }: { order: PengurusanOrder }) {
  const status = BADGE[order.status];
  return status ? <StatusBadge status={status} /> : null;
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
