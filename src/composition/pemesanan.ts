/**
 * The Pemesanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import { createPemesanan, type Pemesanan, type PemesananDeps, type PemesananNotifikasi } from "@/domain/pemesanan";

/**
 * The Notifications seam for the messages a Pemesanan Makam brings (spec,
 * Notifications). The wizard must not send a family message itself, so this is
 * where that module's call lands: the composition root passes the runtime's
 * Notifications (`serverRuntime().notifications`) here as soon as there is a
 * message for a new Terencana order.
 *
 * Until then the announcement is dropped, and nothing is lost but the message: the
 * Akun and its Email Terverifikasi exist the moment the Kode Masuk succeeds, and a
 * placement never waits on a send. The message a Terencana order gets is not a new
 * kind, it is the one Notifications already sends for a Tagihan
 * (`tagihanTerbit`), which goes out when the Lokasi Mitra confirms the order and
 * the Tagihan is issued (ticket 37); the wizard's own confirmation says only that,
 * and promises no message this seam has not sent yet.
 */
export const notifikasiPemesanan: PemesananNotifikasi = {
  pemesananTerencanaDiajukan: async () => {},
};

export function composePemesanan(deps: Omit<PemesananDeps, "notifikasi"> & { notifikasi?: PemesananNotifikasi }): Pemesanan {
  return createPemesanan({ ...deps, notifikasi: deps.notifikasi ?? notifikasiPemesanan });
}
