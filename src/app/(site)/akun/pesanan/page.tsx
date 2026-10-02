import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { StatusBadge, type StatusKey } from "@/components/makam/status-badge";
import type { PengurusanTpuStatus } from "@/domain/pengurusan";
import type { PemesananTerencanaStatus } from "@/domain/pemesanan";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { dataAkunSaya } from "../data";

export const metadata: Metadata = {
  title: "Pesanan · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/** Every status an order on this tab may carry: a Pemesanan Makam (Saat Duka or Terencana) or a Pengurusan order. */
type StatusPesanan = PemesananTerencanaStatus | PengurusanTpuStatus;

/**
 * Every status either order kind may carry, mapped to the shared vocabulary or
 * `null` for a Pengurusan status that carries no badge yet — its own order page
 * (`src/app/pengurusan/[nomor]/page.tsx`) carries the same five-of-eleven
 * mapping. Exhaustive (`satisfies`), so a new status added to either schema
 * fails typecheck here rather than the badge throwing on an unknown key.
 */
const BADGE = {
  diajukan: "diajukan",
  dikonfirmasi: "dikonfirmasi",
  dimakamkan: "dimakamkan",
  selesai: "selesai",
  ditolak: "ditolak",
  dibatalkan: "dibatalkan",
  aktif: "aktif",
  dokumen_lengkap: null,
  menunggu_pembayaran: null,
  diproses: null,
  perlu_perbaikan: null,
  iptm_diajukan: null,
  iptm_terbit: null,
} satisfies Record<StatusPesanan, StatusKey | null>;

interface BarisPesanan {
  nomor: string;
  href: string;
  status: StatusPesanan;
  judul: string;
  diajukanAt: Date;
}

/**
 * Akun Saya's Pesanan tab (spec, story 100): every order on the Akun, newest
 * first — a Pemesanan Makam at a Lokasi Mitra (Saat Duka and Terencana) and a Pengurusan order at a
 * TPU, one Nomor Pemesanan series, one list. "Including CS-submitted orders
 * attached by Nomor Pemesanan" needs no separate branch here: once an order's
 * `pemesanAccountId` names this Akun, by whatever route, `pesananSaya` or
 * `terencanaSaya` already lists it.
 */
export default async function AkunPesananPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const { pesanan } = await dataAkunSaya(actor.accountId);

  const daftar: BarisPesanan[] = [
    ...pesanan.pemesanan.map((order): BarisPesanan => ({
      nomor: order.nomor,
      href: `/pesanan/${order.nomor}`,
      status: order.status,
      judul: `${order.lokasi.name} · ${order.almarhum.name}`,
      diajukanAt: order.diajukanAt,
    })),
    ...pesanan.terencana.map((order): BarisPesanan => ({
      nomor: order.nomor,
      href: `/pesanan/${order.nomor}`,
      status: order.status,
      judul: `${order.lokasi.name} · Terencana · ${order.calonPenghuni.name ?? order.pemesan.name}`,
      diajukanAt: order.diajukanAt,
    })),
    ...pesanan.pengurusan.map((order): BarisPesanan => ({
      nomor: order.nomor,
      href: `/pengurusan/${order.nomor}`,
      status: order.status,
      judul: `${order.tpu.name} · ${order.almarhum.name}`,
      diajukanAt: order.diajukanAt,
    })),
  ].sort((a, b) => b.diajukanAt.getTime() - a.diajukanAt.getTime());

  if (daftar.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Belum ada pesanan"
        description="Pesanan yang Anda ajukan akan muncul di sini, lengkap dengan status, Tagihan dan Bukti."
        action={
          <Link href="/pesan-makam" className="font-medium text-brand underline underline-offset-4">
            Pesan makam
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {daftar.map((order) => (
        <li key={order.nomor}>
          <Link
            href={order.href}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors duration-(--duration-fast) hover:bg-accent"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-small text-muted-foreground">{order.nomor}</span>
              <BadgePesanan status={order.status} />
            </div>
            <span className="font-medium text-foreground">{order.judul}</span>
            <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The shared vocabulary covers every Pemesanan status outright, Terencana's Aktif included; a Pengurusan
 * order's further statuses (dokumen lengkap, IPTM diajukan, …) are ticket
 * 46/47's own slice and carry no badge here yet, same as the order page itself.
 */
function BadgePesanan({ status }: { status: StatusPesanan }) {
  const key = BADGE[status];
  return key ? <StatusBadge status={key} /> : null;
}
