import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LANGKAH_ONBOARDING, langkahOnboardingBelumLengkap, type MitraJasaStatus } from "@/domain/layanan";
import { formatTanggal } from "@/lib/time/jakarta";
import { langkahOnboardingLabels, mitraJasaStatusLabels, skorLabels, skorTitle } from "@/lib/mitra-jasa-labels";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { BerkasForm, CoverageForm, ProfilForm, RekeningForm, StatusForm, TinjauanForm } from "../mitra-jasa-forms";

/**
 * One Mitra Jasa's whole record, for Admin Platform: what onboarding still owes,
 * the profile, the bank account, the three files, the coverage lists, the status,
 * the 90-day scorecard and the monthly review.
 *
 * Everything here is a projection of the module's own state; the page decides
 * nothing and writes through the Server Actions beside it.
 */
export default async function MitraJasaDetailPage({ params }: PageProps<"/staf/admin-platform/mitra-jasa/[mitraJasaId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { mitraJasaId } = await params;
  const { layanan, lokasi } = serverRuntime();
  const dibaca = await layanan.bacaMitraJasa(actor, mitraJasaId);
  if (!dibaca.ok) notFound();
  const mitraJasa = dibaca.mitraJasa;

  const [skor, tinjauan, katalog, tpu] = await Promise.all([
    layanan.skorMitraJasa(actor, mitraJasa.id),
    layanan.tinjauanMitraJasa(actor, mitraJasa.id),
    layanan.katalog(),
    lokasi.tpuDkiList(actor),
  ]);

  const belum = langkahOnboardingBelumLengkap(mitraJasa);
  const layananOptions = katalog.flatMap((satu) => satu.varian.map((varian) => ({ id: varian.id, name: varian.name, layanan: satu.name })));
  const tpuOptions = tpu.map((satu) => ({ id: satu.id, name: satu.name }));
  const terbuka = tinjauan.find((satu) => satu.ditinjauPada === null);

  return (
    <>
      <PageHeader
        title={mitraJasa.namaLengkap}
        description={
          <>
            {mitraJasa.area} · {mitraJasa.email} · NIK {mitraJasa.nik}{" "}
            <StatusMitraJasa status={mitraJasa.status} />
            {mitraJasa.baru ? <Badge variant="secondary">Baru</Badge> : null}
          </>
        }
      />

      {mitraJasa.statusAlasan ? (
        <p className="text-small text-muted-foreground">
          {mitraJasaStatusLabels[mitraJasa.status]} sejak {formatTanggal(mitraJasa.statusDiubahPada.toISOString().slice(0, 10))}: {mitraJasa.statusAlasan}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            {belum.length === 0
              ? "Lengkap: Mitra Jasa ini boleh mendapat pekerjaan."
              : `${belum.length} langkah belum lengkap. Pekerjaan tidak diberikan sampai lengkap.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {LANGKAH_ONBOARDING.map((langkah) => (
              <li key={langkah} className="flex items-center gap-2">
                <span aria-hidden>{belum.includes(langkah) ? "○" : "●"}</span>
                {langkahOnboardingLabels[langkah]}
                {belum.includes(langkah) ? <span className="text-muted-foreground">(belum)</span> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Nama, NIK, area tempat tinggal, dan kontak siaga opsional. Tidak ada NPWP.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfilForm
            mitraJasaId={mitraJasa.id}
            nilai={{
              namaLengkap: mitraJasa.namaLengkap,
              nik: mitraJasa.nik,
              area: mitraJasa.area,
              kontakSiagaNama: mitraJasa.kontakSiaga.name,
              kontakSiagaTelepon: mitraJasa.kontakSiaga.phoneNumber,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rekening Pencairan</CardTitle>
          <CardDescription>Nama pemilik rekening harus sama dengan nama di KTP, atau ada catatan override.</CardDescription>
        </CardHeader>
        <CardContent>
          <RekeningForm
            mitraJasaId={mitraJasa.id}
            namaKtp={mitraJasa.namaLengkap}
            nilai={{
              bankName: mitraJasa.rekening?.bankName ?? "",
              accountNumber: mitraJasa.rekening?.accountNumber ?? "",
              accountHolder: mitraJasa.rekening?.accountHolder ?? "",
              catatanOverride: mitraJasa.rekening?.catatanOverride ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Berkas</CardTitle>
          <CardDescription>Foto KTP, foto Mitra Jasa, dan scan perjanjian bertanda tangan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <BerkasForm mitraJasaId={mitraJasa.id} jenis="ktp" sudah={mitraJasa.ktp.ada} />
          <BerkasForm mitraJasaId={mitraJasa.id} jenis="foto" sudah={mitraJasa.foto.ada} />
          <BerkasForm
            mitraJasaId={mitraJasa.id}
            jenis="perjanjian"
            sudah={mitraJasa.perjanjian.scanUploaded}
            tanggalDitandatangani={mitraJasa.perjanjian.signedOn}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dilayani</CardTitle>
          <CardDescription>TPU DKI dan Layanan yang boleh diberikan pekerjaan kepada Mitra Jasa ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <CoverageForm
            mitraJasaId={mitraJasa.id}
            tpuOptions={tpuOptions}
            layananOptions={layananOptions}
            nilai={mitraJasa.coverage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Menangguhkan atau mengakhiri melepas pekerjaan terjadwal; pekerjaan berjalan dikembalikan ke Antrean.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusForm mitraJasaId={mitraJasa.id} status={mitraJasa.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{skor.ok ? skorTitle(skor.skor.window.dari, skor.skor.window.sampai) : "Skor 90 hari"}</CardTitle>
          <CardDescription>
            {skor.ok ? "Lima angka dari pekerjaan yang selesai, terlambat, keluhan upheld, decline, dan penilaian." : "Skor belum bisa dibaca."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {skor.ok ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {skorLabels.map((satu) => (
                <div key={satu.key}>
                  <dt className="text-muted-foreground">{satu.label}</dt>
                  <dd className="text-title-2">{skor.skor[satu.key] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {terbuka ? (
        <Card>
          <CardHeader>
            <CardTitle>Tinjauan {terbuka.bulan}</CardTitle>
            <CardDescription>Angka di atas yang dihitung saat baris tinjauan dibuka.</CardDescription>
          </CardHeader>
          <CardContent>
            <TinjauanForm mitraJasaId={mitraJasa.id} tinjauanId={terbuka.id} bulan={terbuka.bulan} />
          </CardContent>
        </Card>
      ) : null}

      {tinjauan.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat tinjauan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {tinjauan.map((satu) => (
                <li key={satu.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="font-mono">{satu.bulan}</span>
                  <span>
                    {satu.skor.selesai} selesai · {satu.skor.terlambat} terlambat · {satu.skor.keluhanUpheld} upheld · {satu.skor.declines} declines
                  </span>
                  <span className="text-muted-foreground">
                    {satu.ditinjauPada ? `Ditinjau ${formatTanggal(satu.ditinjauPada.toISOString().slice(0, 10))}` : "Belum ditinjau"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function StatusMitraJasa({ status }: { status: MitraJasaStatus }) {
  return <StatusBadge status={status} />;
}
