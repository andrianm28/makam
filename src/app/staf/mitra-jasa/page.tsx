import { redirect } from "next/navigation";

/**
 * Mitra Jasa has no separate Beranda: Pekerjaan, its first bottom
 * navigation item, is its home (docs/design-system.md, "The staff shell").
 */
export default function MitraJasaPage() {
  redirect("/staf/mitra-jasa/pekerjaan");
}
