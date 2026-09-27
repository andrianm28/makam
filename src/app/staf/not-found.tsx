import { NotFoundMessage } from "@/components/makam/not-found-message";

export const metadata = { title: "Halaman tidak ditemukan" };

/**
 * A 404 inside the staff area keeps the staff shell (the nearest layout) and this
 * message, rather than the public site's frame nested inside it.
 */
export default function StaffNotFound() {
  return <NotFoundMessage links={[{ href: "/staf", label: "Kembali ke Beranda staf" }]} />;
}
