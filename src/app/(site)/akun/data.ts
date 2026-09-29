import "server-only";
import { cache } from "react";
import type { PemesananOrder } from "@/domain/pemesanan";
import type { PengurusanOrder } from "@/domain/pengurusan";
import { documentPagePath } from "@/lib/document-links";
import { perluTindakanDariPesanan, type PerluTindakanItem, type RingkasanTindakan } from "@/lib/perlu-tindakan";
import { serverRuntime } from "@/server/runtime";

export interface PesananSaya {
  pemesanan: PemesananOrder[];
  pengurusan: PengurusanOrder[];
}

/**
 * Every order on the Akun (spec, story 100), both kinds together, and the
 * Perlu Tindakan items they carry (story 99). Wrapped in `cache()` so the
 * layout's strip and the Pesanan tab's own list, which both need it, share one
 * read per request rather than two.
 */
export const dataAkunSaya = cache(async (accountId: string): Promise<{ pesanan: PesananSaya; perluTindakan: PerluTindakanItem[] }> => {
  const { pemesanan, pengurusan, billing } = serverRuntime();
  const [daftarPemesanan, daftarPengurusan] = await Promise.all([
    pemesanan.pesananSaya({ accountId }),
    pengurusan.pesananSaya({ accountId }),
  ]);

  const ringkasanPemesanan: RingkasanTindakan[] = await Promise.all(
    daftarPemesanan.map(async (order): Promise<RingkasanTindakan> => {
      const tagihan = order.tagihanId ? await billing.tagihan(order.tagihanId) : null;
      return {
        nomor: order.nomor,
        href: `/pesanan/${order.nomor}`,
        tagihan: tagihan ? { status: tagihan.status, href: documentPagePath(tagihan.link) } : null,
        dokumenBelum: order.dokumen.filter((dokumen) => !dokumen.diunggah).length,
        alternatifMenunggu: order.alternatif !== null,
        tertutup: order.status === "ditolak" || order.status === "dibatalkan",
      };
    }),
  );
  const ringkasanPengurusan: RingkasanTindakan[] = await Promise.all(
    daftarPengurusan.map(async (order): Promise<RingkasanTindakan> => {
      const tagihan = order.tagihan ? await billing.tagihan(order.tagihan.id) : null;
      return {
        nomor: order.nomor,
        href: `/pengurusan/${order.nomor}`,
        tagihan: tagihan ? { status: tagihan.status, href: documentPagePath(tagihan.link) } : null,
        // The TPU document checklist tracks no upload state yet (tickets 46, 47's
        // own slice): this is that provider's extension point, not a gap this
        // ticket narrows — see the ticket's Comments.
        dokumenBelum: 0,
        alternatifMenunggu: order.tawaran !== null,
        tertutup: order.status === "ditolak" || order.status === "dibatalkan",
      };
    }),
  );

  return {
    pesanan: { pemesanan: daftarPemesanan, pengurusan: daftarPengurusan },
    perluTindakan: perluTindakanDariPesanan([...ringkasanPemesanan, ...ringkasanPengurusan]),
  };
});
