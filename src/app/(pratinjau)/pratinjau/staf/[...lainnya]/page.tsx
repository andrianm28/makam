import { ConstructionIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { buttonVariants } from "@/components/ui/button";
import { BASE, pageTitle } from "../_shell/nav";

/** PROTOTYPE: every menu item without a sample page lands here. */
export default async function BelumAdaPratinjau({ params }: PageProps<"/pratinjau/staf/[...lainnya]">) {
  const { lainnya } = await params;
  const title = pageTitle(`${BASE}/${lainnya.join("/")}`) ?? "Halaman";
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={ConstructionIcon}
        title="Belum ada di pratinjau"
        description="Halaman ini memakai pola yang sama dengan contoh lain. Lihat daftar Lokasi Mitra untuk pola daftar, atau Pengaturan Operator untuk pola formulir."
        action={
          <Link href={`${BASE}/katalog`} className={buttonVariants({ variant: "outline" })}>
            Buka Katalog design system
          </Link>
        }
      />
    </>
  );
}
