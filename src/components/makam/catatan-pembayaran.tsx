import { jatuhTempoLabel } from "@/lib/pemesanan-labels";

/**
 * The note every screen that promises "nothing is paid now" carries (spec,
 * Pemesanan: the Tagihan is issued at the Lokasi's confirmation, not at
 * submission, and the burial never waits for the money). Both the wizard's
 * "Data & kirim" and the order page say exactly this, with the deadline the
 * order's own Lokasi Mitra sets — never a number written in copy.
 */
export function CatatanPembayaran({ jumlahJam }: { jumlahJam: number | null }) {
  return (
    <div className="rounded-xl bg-info-soft p-4 text-body text-info-soft-foreground">
      <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
      <p className="mt-1">
        Tagihan terbit setelah Lokasi Mitra mengonfirmasi, dan {jatuhTempoLabel(jumlahJam)}. Pemakaman tetap berjalan.
        Dokumen boleh diunggah nanti atau dibawa saat hari pemakaman.
      </p>
    </div>
  );
}
