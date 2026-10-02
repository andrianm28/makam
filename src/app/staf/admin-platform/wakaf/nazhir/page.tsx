import Link from "next/link";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { HapusNazhirForm, NazhirForm } from "../wakaf-forms";

/** Admin Platform keeps the Nazhir list (name, type, kab/kota, contact, BWI number). A Nazhir has no login. */
export default async function NazhirPage() {
  const actor = await staffMenuActor("admin_platform");
  const daftar = await serverRuntime().wakaf.daftarNazhir(actor);

  return (
    <>
      <PageHeader
        title="Daftar Nazhir"
        description="Nazhir yang bisa dipilih Wakif dan dicocokkan Admin Platform. Kontak dan nomor BWI hanya terlihat di sini."
        actions={
          <Link href="/staf/admin-platform/wakaf" className="text-sm font-medium text-brand underline underline-offset-4">
            Pengajuan Wakaf
          </Link>
        }
      />
      <FormSection title="Tambah Nazhir">
        <NazhirForm />
      </FormSection>
      <FormSection title="Daftar">
        {daftar.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada Nazhir.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {daftar.map((nazhir) => (
              <li key={nazhir.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <NazhirForm nazhir={nazhir} />
                <HapusNazhirForm nazhirId={nazhir.id} />
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );
}
