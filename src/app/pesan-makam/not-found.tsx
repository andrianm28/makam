import { NotFoundMessage } from "@/components/makam/not-found-message";

export const metadata = { title: "Halaman tidak ditemukan" };

/**
 * A 404 inside a booking wizard keeps the wizard's own frame: a family in the
 * middle of a burial needs a way out to a screen they recognise, not the public
 * site's menu. The wizard's frame already carries the CS.
 */
export default function PesanMakamNotFound() {
  return <NotFoundMessage links={[{ href: "/pesan-makam/saat-duka", label: "Kembali ke pilih makam" }]} />;
}
