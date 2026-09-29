import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { authorize, pemesananResource } from "@/domain/identity";
import type { HitungPembatalan, PembatalanHakPakai, PermintaanPembatalan } from "@/domain/pemesanan";
import { artiStatusPermintaan, sebabTerhalangText, statusPermintaanBadge } from "@/lib/pembatalan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { AjukanPembatalanForm, AjukanUlangForm, BatalkanPermintaanForm } from "./pembatalan-forms";

export const metadata: Metadata = {
  title: "Pembatalan Hak Pakai · Makam.co.id",
  // The address names one Hak Pakai: never indexed, never followed.
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ hakPakaiId: z.uuid() });

/**
 * "Ajukan Pembatalan" of one Hak Pakai of a paid Pemesanan Terencana (spec, story 102; ticket 38), reached from
 * Akun Saya's Makam tab: what the refund would be under the order's own Syarat before anything is asked, the
 * request and where it stands once it is, and what the family can do next (file it again after a fix, or
 * withdraw it). Only the Pemegang Hak of the Hak Pakai sees anything here; everybody else is told nothing found.
 * Every figure and every "cannot" was decided by the Pemesanan module.
 */
export default async function PembatalanPage({ params }: PageProps<"/pembatalan/[hakPakaiId]">) {
  const id = paramsSchema.safeParse(await params);
  if (!id.success) notFound();
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (!authorize(actor, "pembatalan.ajukan", pemesananResource(actor.accountId)).allowed) notFound();
  const hasil = await serverRuntime().pemesanan.pratinjauPembatalanTerencana({ accountId: actor.accountId, email: actor.email }, id.data.hakPakaiId);
  if (!hasil.ok) notFound();
  const { pembatalan } = hasil;
  const permintaan = pembatalan.permintaan;
  const terbuka = permintaan !== null && (permintaan.status === "diajukan" || permintaan.status === "perlu_perbaikan");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Pembatalan Hak Pakai</h1>
        <p className="text-body-lg text-muted-foreground" data-testid="pembatalan-petak">
          {pembatalan.lokasi.name} · {pembatalan.unit.map((unit) => unit.nomor).join(", ")} · pesanan {pembatalan.nomor}
        </p>
      </header>

      {permintaan ? <StatusPermintaan hakPakaiId={pembatalan.hakPakaiId} permintaan={permintaan} terbuka={terbuka} /> : null}

      {pembatalan.bisaMengajukan.ok ? (
        <>
          <RincianRefund pembatalan={pembatalan} refund={pembatalan.bisaMengajukan.refund} />
          <section className="flex flex-col gap-3">
            <h2 className="text-title-3 text-foreground">Ajukan Pembatalan</h2>
            <p className="text-small text-muted-foreground">
              Pembatalan ini hanya untuk petak {pembatalan.unit.map((unit) => unit.nomor).join(", ")}; petak lain pada pesanan yang sama tidak terpengaruh.
              Kalau Lokasi Mitra menyetujui, Hak Pakai petak ini dibatalkan dan petaknya kembali ke Lokasi Mitra. Sampai ada jawaban, Hak Pakai Anda tetap berlaku.
            </p>
            <AjukanPembatalanForm hakPakaiId={pembatalan.hakPakaiId} />
          </section>
        </>
      ) : !terbuka ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="pembatalan-tidak-bisa">
          {sebabTerhalangText(pembatalan.bisaMengajukan.sebab)}
        </p>
      ) : null}

      <Link href="/akun/makam" className="text-body font-medium text-brand underline underline-offset-4">
        Kembali ke Makam Keluarga
      </Link>
    </main>
  );
}

/** What asking now would refund: the whole tariff inside the Masa Pembatalan, the share the Syarat gave after it, and never the fee. */
function RincianRefund({ pembatalan, refund }: { pembatalan: PembatalanHakPakai; refund: HitungPembatalan }) {
  return (
    <section className="flex flex-col gap-3" data-testid="pembatalan-refund">
      <h2 className="text-title-3 text-foreground">Yang akan dikembalikan</h2>
      <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
        <Baris label="Tarif Hak Pakai" value={formatRupiah(refund.tarif)} />
        <Baris
          label={refund.dalamMasaPembatalan ? "Dikembalikan (masih dalam Masa Pembatalan)" : `Dikembalikan (${refund.persenRefund}% sesuai Syarat)`}
          value={formatRupiah(refund.jumlahRefund)}
          kuat
        />
        <Baris label="Biaya Layanan Platform (tidak dikembalikan)" value={formatRupiah(refund.biayaLayananPlatform)} />
      </dl>
      <p className="text-small text-muted-foreground">
        {refund.dalamMasaPembatalan
          ? `Masa Pembatalan Anda ${pembatalan.masaPembatalanBerakhirPada ? `berakhir ${formatTanggalJam(pembatalan.masaPembatalanBerakhirPada)}` : "masih berjalan"}, jadi seluruh tarif Hak Pakai dikembalikan.`
          : `Masa Pembatalan sudah berakhir${pembatalan.masaPembatalanBerakhirPada ? ` (${formatTanggalJam(pembatalan.masaPembatalanBerakhirPada)})` : ""}. Menurut Syarat yang Anda setujui saat memesan, ${pembatalan.syarat.refundAfterMasaPembatalanPercent}% dari tarif dikembalikan.`}{" "}
        Angka ini dihitung dari Syarat pesanan Anda, bukan kebijakan Lokasi Mitra hari ini, dan tetap sejak Anda mengajukan.
      </p>
      <p className="text-small text-muted-foreground">
        Dana dikembalikan kepada Pemesan yang membayar pesanan ini, ke rekening yang ia isi sendiri; ia diberi tahu lewat email begitu Pembatalan disetujui.
        Admin kami menyetujui dan mentransfernya setelah itu.
      </p>
    </section>
  );
}

/** Where the request stands, what that means and what the family can do about it. */
function StatusPermintaan({ hakPakaiId, permintaan, terbuka }: { hakPakaiId: string; permintaan: PermintaanPembatalan; terbuka: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" data-testid="pembatalan-status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title-3 text-foreground">Permintaan Pembatalan</h2>
        <StatusBadge status={statusPermintaanBadge[permintaan.status]} />
      </div>
      <p className="text-body text-muted-foreground">{artiStatusPermintaan(permintaan.status)}</p>
      <dl className="flex flex-col gap-2 text-body">
        <Baris label="Diajukan" value={formatTanggalJam(permintaan.diajukanPada)} />
        {permintaan.status === "diajukan" && permintaan.tenggatPada ? <Baris label="Dijawab paling lambat" value={formatTanggalJam(permintaan.tenggatPada)} /> : null}
        <Baris
          label={permintaan.dalamMasaPembatalan ? "Pengembalian (seluruh tarif)" : `Pengembalian (${permintaan.persenRefund}% dari tarif)`}
          value={formatRupiah(permintaan.jumlahRefund)}
        />
        {permintaan.alasanKeputusan ? (
          <Baris label={permintaan.status === "perlu_perbaikan" ? "Yang diminta Lokasi Mitra" : "Alasan Lokasi Mitra"} value={permintaan.alasanKeputusan} />
        ) : null}
      </dl>
      {permintaan.status === "perlu_perbaikan" ? <AjukanUlangForm hakPakaiId={hakPakaiId} id={permintaan.id} /> : null}
      {terbuka ? <BatalkanPermintaanForm hakPakaiId={hakPakaiId} id={permintaan.id} /> : null}
    </section>
  );
}

function Baris({ label, value, kuat = false }: { label: string; value: string; kuat?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={kuat ? "text-right font-semibold text-foreground" : "text-right font-medium text-foreground"}>{value}</dd>
    </div>
  );
}
