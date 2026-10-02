import type { PemesananSetup } from "./pemesanan";
import { siapkanOperatorPemesanan, terverifikasiLokasi } from "./pemesanan";

/**
 * A Terverifikasi Lokasi Mitra with one cleared Petak, an Aktif Hak Pakai on it held by the named person, and
 * (when asked) the Lokasi's tumpang flags switched on. Shared by the further-burial action tests (ticket 35).
 */
export async function hakPakaiDenganPemegang(
  setup: PemesananSetup,
  pemegangHak: { name: string; phoneNumber: string; email?: string },
) {
  await siapkanOperatorPemesanan(setup);
  const lokasi = await terverifikasiLokasi(setup, { petak: { rows: 1, cols: 3 } });
  const denah = await setup.inventory.asStaff(lokasi.adminLokasi).blok(lokasi.lokasiMitra.id, lokasi.blok!.id);
  const petak = (denah?.cells ?? []).find((cell) => cell.kind === "petak" && cell.nomorMakam);
  if (!petak) throw new Error("no Petak in the fixture");
  const dibuat = await setup.inventory.beriHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, {
    petakId: petak.id,
    jenisMakamId: lokasi.jenisMakam.id,
    pemegangHak,
  });
  if (!dibuat.ok) throw new Error(`Hak Pakai refused: ${dibuat.reason}`);
  return { lokasi, hakPakaiId: dibuat.hakPakaiId };
}
