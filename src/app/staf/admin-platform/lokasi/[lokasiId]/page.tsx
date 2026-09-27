import { notFound, redirect } from "next/navigation";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  lokasiFacilities,
  publishGate,
  terencanaSwitchGate,
  type PublishGateFacts,
  type PublishGateItem,
  type PublishGateKey,
  type TerencanaSwitchKey,
} from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import {
  ActivateTerencanaForm,
  AgreementForm,
  BankAccountForm,
  DocumentsForm,
  PoliciesForm,
  ProfileForm,
  PublishForm,
} from "../lokasi-forms";
import { MintaKunjunganUlangForm } from "./minta-kunjungan-ulang-form";

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
    hint: () => "Ditugaskan dari tab Tugas Lapangan, atau tombol \"Minta kunjungan ulang\" di bawah.",
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
  const [read, jam, siaga, tariffsChecked, kunjunganVerifikasiSelesai] = await Promise.all([
    lokasi.lokasiMitra(actor, lokasiId),
    lokasi.jamOperasional(actor, lokasiId),
    lokasi.kontakSiaga(actor, lokasiId),
    tariffs.asStaff(actor).tariffsChecked(lokasiId),
    lokasi.kunjunganVerifikasiSelesai(lokasiId),
  ]);
  if (!read.ok || !jam.ok || !siaga.ok) return null;

  const facts: PublishGateFacts = {
    agreement: read.lokasiMitra.agreement,
    kunjunganVerifikasiSelesai,
    tariffsChecked: tariffsChecked && { changedSinceCheck: tariffsChecked.changedSinceCheck },
    jamOperasionalDiisi: jam.jamOperasional !== null,
    kontakSiagaDipilih: siaga.kontakSiaga !== null,
  };
  const gate = publishGate(facts);
  const sudahTerbit = read.lokasiMitra.status !== "belum_tayang";

  return (
    <Section
      id="syarat-tayang"
      title="Syarat tayang"
      description={
        sudahTerbit
          ? "Lokasi Mitra ini sudah tidak Belum Tayang."
          : gate.ready
            ? "Setiap syarat terpenuhi: siap diterbitkan."
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
      {sudahTerbit ? null : <PublishForm lokasiId={lokasiId} ready={gate.ready} />}
    </Section>
  );
}

const terencanaSwitchCopy: Record<TerencanaSwitchKey, string> = {
  petak_dibersihkan: "Setiap Petak Makam sudah dibersihkan (tidak ada yang Perlu Verifikasi lagi)",
  cek_denah: "Cek Denah sudah dilakukan",
};

/** The Terencana switch's own checklist, separate from the publish gate. */
async function TerencanaSwitchChecklist({ lokasiId }: { lokasiId: string }) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasi, inventory } = serverRuntime();
  const [read, cekDenah, hasPetakPerluVerifikasi] = await Promise.all([
    lokasi.lokasiMitra(actor, lokasiId),
    lokasi.cekDenahOf(lokasiId),
    inventory.hasPetakPerluVerifikasi(lokasiId),
  ]);
  if (!read.ok) return null;
  const aktif = read.lokasiMitra.flags.pemesananTerencanaAktif;
  const gate = terencanaSwitchGate({ hasPetakPerluVerifikasi, cekDenahDilakukan: cekDenah !== null });

  return (
    <Section
      id="syarat-terencana"
      title="Syarat Pemesanan Terencana"
      description={
        aktif
          ? "Pemesanan Terencana aktif untuk Lokasi Mitra ini."
          : "Kedua syarat berikut harus terpenuhi sebelum Pemesanan Terencana bisa diaktifkan."
      }
    >
      <ul className="flex flex-col gap-3">
        {gate.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            {item.met ? (
              <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <p className={cn("text-body", item.met ? "text-foreground" : "text-foreground font-medium")}>
              {terencanaSwitchCopy[item.key]}
            </p>
          </li>
        ))}
      </ul>
      {aktif ? null : <ActivateTerencanaForm lokasiId={lokasiId} ready={gate.ready} />}
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
  const staffAccounts = await serverRuntime().identity.staffAccounts();
  const petugas = staffAccounts
    .filter((account) => account.roles.includes("petugas_lapangan") && !account.deactivated)
    .map((account) => ({ accountId: account.accountId, email: account.email ?? account.accountId }));

  return (
    <>
      <PublishGateChecklist lokasiId={lokasiMitra.id} />

      <Section
        id="kunjungan-verifikasi"
        title="Kunjungan Verifikasi"
        description="Konfirmasi alamat, pin, fasilitas dan foto pada kunjungan lapangan terakhir."
      >
        {lokasiMitra.kunjunganVerifikasi ? (
          <p className="text-body">
            Terakhir dikunjungi {lokasiMitra.kunjunganVerifikasi.visitedOn} ({lokasiMitra.kunjunganVerifikasi.photos.length}{" "}
            foto).
          </p>
        ) : (
          <p className="text-body text-muted-foreground">Belum ada Kunjungan Verifikasi.</p>
        )}
        <MintaKunjunganUlangForm lokasiMitra={lokasiMitra} petugas={petugas} />
      </Section>

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

      <TerencanaSwitchChecklist lokasiId={lokasiMitra.id} />
    </>
  );
}
