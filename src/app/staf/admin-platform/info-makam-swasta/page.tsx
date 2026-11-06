import { redirect } from "next/navigation";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { authorize, semuaLokasiMitraResource } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { InfoMakamSwastaForm } from "./info-makam-swasta-forms";
import { TampilInfoMakamSwastaForm } from "./tampil-form";

/**
 * Admin Platform keeps Info Makam Swasta: the private cemeteries that are not
 * Lokasi Mitra yet, shown on /info-makam-swasta, on the Beranda and on an empty
 * Daftar Lokasi, each labelled "Belum bermitra".
 */
export default async function InfoMakamSwastaAdminPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "lokasi.buat", semuaLokasiMitraResource()).allowed) redirect("/staf");
  const daftar = await serverRuntime().lokasi.semuaInfoMakamSwasta(actor);

  return (
    <>
      <PageHeader
        title="Info Makam Swasta"
        description="Pemakaman swasta yang belum bermitra, dari sumber publik. Di situs setiap entri berlabel “Belum bermitra” dan tidak bisa dipesan atau dibayar; jangan tulis harga, “terverifikasi” atau “bermitra”. Setelah sebuah lokasi bermitra dan tayang sebagai Lokasi Mitra, sembunyikan entrinya di sini."
      />

      <FormSection title="Tambah entri">
        <InfoMakamSwastaForm entri={null} />
      </FormSection>

      <FormSection title={`Daftar (${daftar.length})`}>
        {daftar.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada entri Info Makam Swasta.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {daftar.map((entri) => (
              <li key={entri.id} className="rounded-xl border border-border p-4">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {entri.urutan}. {entri.nama} · {entri.kota}
                    </span>
                    <span className="text-xs text-muted-foreground">{entri.tampil ? "Tampil di situs" : "Disembunyikan"}</span>
                  </summary>
                  <div className="mt-4 flex flex-col gap-4">
                    <InfoMakamSwastaForm entri={entri} />
                    <TampilInfoMakamSwastaForm id={entri.id} tampil={entri.tampil} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );
}
