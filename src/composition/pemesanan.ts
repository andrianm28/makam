/**
 * The Pemesanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import { createPemesanan, type Pemesanan, type PemesananDeps, type PemesananNotifikasi } from "@/domain/pemesanan";

/**
 * The Notifications seam for the messages a Pemesanan Makam brings (spec,
 * Notifications): the Peringatan Staf a new order raises for the Lokasi's
 * staff, and the family's own email.
 *
 * The Notifications module is a later ticket, so nothing is sent yet. The
 * wizard must not send a family message itself, so this is where that module's
 * call lands: the composition root passes the runtime's Notifications
 * (`serverRuntime().notifications`) to this factory once it has the message.
 * Until then the announcement is dropped, and nothing is lost but the message:
 * the Akun and its Email Terverifikasi exist the moment the Kode Masuk
 * succeeds, and a placement never waits on this.
 */
export const notifikasiPemesanan: PemesananNotifikasi = {
  pemesananDiajukan: async () => {},
};

export function composePemesanan(deps: Omit<PemesananDeps, "notifikasi"> & { notifikasi?: PemesananNotifikasi }): Pemesanan {
  return createPemesanan({ ...deps, notifikasi: deps.notifikasi ?? notifikasiPemesanan });
}
