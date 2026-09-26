import { notFound, redirect } from "next/navigation";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { lokasiFacilities, publishGate, type PublishGateFacts, type PublishGateItem, type PublishGateKey } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import {
  AgreementForm,
  BankAccountForm,
  DocumentsForm,
  PoliciesForm,
  ProfileForm,
} from "../lokasi-forms";

const facilityOptions = Object.entries(lokasiFacilities).map(([value, label]) => ({ value, label }));

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader>
          <CardTitle id={id}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </section>
  );
}

const publishGateCopy: Record<PublishGateKey, { label: string; hint: (item: PublishGateItem) => string }> = {
  perjanjian: { label: "Perjanjian ditandatangani", hint: () => "Scan perjanjian dan tanggal tanda tangannya, di bawah." },
  kunjungan_verifikasi: {
    label: "Kunjungan Verifikasi selesai",
    hint: () => "Belum ada cara mencatatnya di sini.",
  },
  tarif_diperiksa: {
    label: "Tarif diperiksa",
    hint: (item) =>
      item.key === "tarif_diperiksa" && item.tarifBerubahSejakDiperiksa
        ? "Ada tarif baru sejak diperiksa terakhir: periksa lagi di tab Tarif."
        : "Dicocokkan dengan perjanjian, dan belum berubah sejak itu; tandai di tab Tarif.",
  },
  jam_operasional: { label: "Jam Operasional terisi", hint: () => "Jam buka mingguan dan Tanggal Tutup, di tab Jam Operasional." },
  kontak_siaga: { label: "Kontak Siaga dipilih", hint: () => "Salah satu Admin Lokasi, di tab Jam Operasional." },
};

/** Ringkasan: the publish gate checklist, then this Lokasi Mitra's onboarding record. */
async function PublishGateChecklist({ lokasiId }: { lokasiId: string }) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasi, tariffs } = serverRuntime();
  const [read, jam, siaga, tariffsChecked] = await Promise.all([
    lokasi.lokasiMitra(actor, lokasiId),
    lokasi.jamOperasional(actor, lokasiId),
    lokasi.kontakSiaga(actor, lokasiId),
    tariffs.asStaff(actor).tariffsChecked(lokasiId),
  ]);
  if (!read.ok || !jam.ok || !siaga.ok) return null;

  const facts: PublishGateFacts = {
    agreement: read.lokasiMitra.agreement,
    // No Kunjungan Verifikasi is recorded anywhere yet: never met in v1.
    kunjunganVerifikasiSelesai: false,
    tariffsChecked: tariffsChecked && { changedSinceCheck: tariffsChecked.changedSinceCheck },
    jamOperasionalDiisi: jam.jamOperasional !== null,
    kontakSiagaDipilih: siaga.kontakSiaga !== null,
  };
  const gate = publishGate(facts);

  return (
    <Section
      id="syarat-tayang"
      title="Syarat tayang"
      description={
        gate.ready
          ? "Setiap syarat terpenuhi."
          : "Semua syarat berikut harus terpenuhi sebelum Lokasi Mitra ini bisa Terverifikasi."
      }
    >
      <ul className="flex flex-col gap-3">
        {gate.items.map((item) => {
          const copy = publishGateCopy[item.key];
          return (
            <li key={item.key} className="flex items-start gap-3">
              {item.met ? (
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex flex-col gap-0.5">
                <p className={cn("text-body", item.met ? "text-foreground" : "text-foreground font-medium")}>{copy.label}</p>
                <p className="text-small text-muted-foreground">{copy.hint(item)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Admin Platform, tab Ringkasan: the publish gate, profil, perjanjian, rekening, dokumen dan kebijakan. */
export default async function LokasiMitraRingkasanPage({ params }: PageProps<"/staf/admin-platform/lokasi/[lokasiId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi } = serverRuntime();
  const read = await lokasi.lokasiMitra(actor, lokasiId);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf");
  }
  const lokasiMitra = read.lokasiMitra;

  return (
    <>
      <PublishGateChecklist lokasiId={lokasiMitra.id} />

      <Section id="profil" title="Profil" description="Pengelola, alamat, kota / kabupaten, pin peta dan fasilitas.">
        <ProfileForm lokasiMitra={lokasiMitra} facilities={facilityOptions} />
      </Section>

      <Section id="perjanjian" title="Perjanjian" description="Scan perjanjian kerja sama yang ditandatangani, dan tanggalnya.">
        {lokasiMitra.agreement.scanUploaded ? (
          <p className="text-body">
            Ditandatangani {lokasiMitra.agreement.signedOn}.{" "}
            <a
              href={`/staf/admin-platform/lokasi/${lokasiMitra.id}/perjanjian`}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-4"
            >
              Lihat scan perjanjian
            </a>{" "}
            <span className="text-muted-foreground">(tautan berlaku 5 menit)</span>
          </p>
        ) : (
          <p className="text-body text-muted-foreground">Belum ada scan perjanjian.</p>
        )}
        <AgreementForm lokasiId={lokasiMitra.id} signedOn={lokasiMitra.agreement.signedOn} />
      </Section>

      <Section
        id="rekening"
        title="Rekening"
        description="Rekening tujuan Pencairan. Hanya Admin Platform yang bisa mengubahnya; setiap perubahan tercatat di Audit Log."
      >
        <BankAccountForm lokasiMitra={lokasiMitra} />
      </Section>

      <Section id="dokumen" title="Dokumen" description="Dokumen yang dibawa keluarga untuk Pemakaman di Lokasi ini.">
        <DocumentsForm lokasiId={lokasiMitra.id} documents={lokasiMitra.documentChecklist} />
      </Section>

      <Section id="kebijakan" title="Kebijakan dan flag">
        <PoliciesForm lokasiId={lokasiMitra.id} policies={lokasiMitra.policies} flags={lokasiMitra.flags} />
      </Section>
    </>
  );
}
