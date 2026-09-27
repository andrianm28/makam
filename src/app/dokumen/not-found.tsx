import { NotFoundMessage } from "@/components/makam/not-found-message";

export const metadata = { title: "Halaman tidak ditemukan" };

/**
 * A 404 on a Tagihan's or Bukti's link page keeps the document's own frame. The
 * link is the only key a family has for it, so the page says plainly that this
 * address is not one of them and offers the way back.
 */
export default function DokumenNotFound() {
  return <NotFoundMessage links={[{ href: "/", label: "Kembali ke Beranda" }]} />;
}
