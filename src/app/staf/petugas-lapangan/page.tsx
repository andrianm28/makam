import { redirect } from "next/navigation";

/**
 * Petugas Lapangan has no separate Beranda: Tugas, its first bottom
 * navigation item, is its home (docs/design-system.md, "The staff shell").
 */
export default function PetugasLapanganPage() {
  redirect("/staf/petugas-lapangan/tugas");
}
