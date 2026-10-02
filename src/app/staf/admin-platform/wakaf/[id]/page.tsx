import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { labelStatusWakaf, transisiStaf } from "@/domain/wakaf/skema";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { CatatanForm, CocokkanNazhirForm, PindahStatusForm } from "../wakaf-forms";

/** One Pengajuan Wakaf as Admin Platform reads it: everything, the survey and internal notes included. */
export default async function PengajuanWakafPage({ params }: PageProps<"/staf/admin-platform/wakaf/[id]">) {
  const actor = await staffMenuActor("admin_platform");
  const { id } = await params;
  const { wakaf, identity } = serverRuntime();
  const hasil = await wakaf.pengajuanStaf(actor, id);
  if (!hasil.ok) notFound();
  const pengajuan = hasil.pengajuan;
  const [nazhir, akunStaf] = await Promise.all([wakaf.daftarNazhir(actor), identity.staffAccounts()]);
  const petugas = akunStaf
    .filter((akun) => akun.roles.includes("petugas_lapangan") && !akun.deactivated)
    .map((akun) => ({ accountId: akun.accountId, email: akun.email ?? akun.accountId }));
  const pilihan = transisiStaf[pengajuan.status].map((status) => ({ value: status, label: labelStatusWakaf[status] }));

  return (
    <>
      <PageHeader
        title={pengajuan.nomor}
        description={`${labelStatusWakaf[pengajuan.status]} · diajukan ${formatTanggalJam(pengajuan.diajukanPada)}`}
        actions={
          <Link href="/staf/admin-platform/wakaf" className="text-sm font-medium text-brand underline underline-offset-4">
            Semua Pengajuan
          </Link>
        }
      />

      <FormSection title="Wakif dan tanah">
        <dl className="grid gap-x-6 gap-y-2 text-body sm:grid-cols-2">
          <Baris label="Wakif">{pengajuan.wakifNama}</Baris>
          <Baris label="Email">{pengajuan.wakifEmail}</Baris>
          <Baris label="Telepon">{pengajuan.wakifTelepon}</Baris>
          <Baris label="Hubungan dengan tanah">{pengajuan.hubunganDenganTanah}</Baris>
          <Baris label="Tujuan">{pengajuan.tujuan === "keluarga" ? `Keluarga (${pengajuan.namaKeluarga ?? "-"})` : "Sosial"}</Baris>
          <Baris label="Kabupaten/kota">{pengajuan.kabKota}</Baris>
          <Baris label="Alamat">{pengajuan.alamat}</Baris>
          <Baris label="Pin">{pengajuan.pin ? `${pengajuan.pin.lat}, ${pengajuan.pin.lng}` : "Tidak ada"}</Baris>
          <Baris label="Luas">{pengajuan.luasM2.toLocaleString("id-ID")} m²</Baris>
          <Baris label="Bukti kepemilikan">{pengajuan.jenisBukti}</Baris>
          <Baris label="Nazhir">{pengajuan.nazhirNama ?? "Belum dipilih"}</Baris>
          {pengajuan.alasan ? <Baris label="Alasan">{pengajuan.alasan}</Baris> : null}
          {pengajuan.tanggalSurvei ? <Baris label="Tanggal survei">{formatTanggal(pengajuan.tanggalSurvei)}</Baris> : null}
          {pengajuan.tanggalIkrar ? <Baris label="Tanggal ikrar">{formatTanggal(pengajuan.tanggalIkrar)}</Baris> : null}
          {pengajuan.tugasSurveiId ? (
            <Baris label="Survei Wakaf">
              <Link href="/staf/admin-platform/tugas-lapangan" className="text-primary underline underline-offset-2">
                Tugas Lapangan {pengajuan.tugasSurveiId}
              </Link>
            </Baris>
          ) : null}
        </dl>
      </FormSection>

      <FormSection title="Berkas">
        {pengajuan.berkas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada berkas.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body">
            {pengajuan.berkas.map((berkas) => (
              <li key={berkas.id}>
                <a href={`/staf/admin-platform/wakaf/${pengajuan.id}/berkas/${berkas.id}`} className="text-primary underline underline-offset-2">
                  {berkas.kunci === "hasil" ? "Scan AIW / sertipikat" : berkas.kunci.replaceAll("_", " ")}
                </a>{" "}
                <span className="text-small text-muted-foreground">({berkas.oleh === "wakif" ? "Wakif" : "Admin Platform"})</span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Riwayat status">
        <ol className="flex flex-col gap-1 text-body">
          {pengajuan.riwayat.map((satu, indeks) => (
            <li key={indeks}>
              {labelStatusWakaf[satu.status]} · {formatTanggalJam(satu.pada)}
              {satu.tanggal ? ` · ${formatTanggal(satu.tanggal)}` : ""}
            </li>
          ))}
        </ol>
      </FormSection>

      <FormSection title="Pindah status">
        <PindahStatusForm pengajuanId={pengajuan.id} pilihan={pilihan} petugas={petugas} />
      </FormSection>

      <FormSection title="Cocokkan Nazhir">
        <CocokkanNazhirForm pengajuanId={pengajuan.id} nazhir={nazhir.map((satu) => ({ id: satu.id, nama: satu.nama }))} terpilih={pengajuan.nazhirId} />
      </FormSection>

      <FormSection title="Catatan" description="Catatan untuk Wakif tampil di tab Wakaf-nya; catatan internal tidak pernah.">
        <ul className="flex flex-col gap-2 text-body">
          {pengajuan.catatan.map((catatan) => (
            <li key={catatan.id} className="rounded-lg border bg-card px-3 py-2">
              <span className="text-small font-semibold text-muted-foreground">
                {catatan.jenis === "internal" ? "Internal" : "Untuk Wakif"} · {formatTanggalJam(catatan.pada)}
              </span>
              <p>{catatan.isi}</p>
            </li>
          ))}
        </ul>
        <CatatanForm pengajuanId={pengajuan.id} />
      </FormSection>
    </>
  );
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
