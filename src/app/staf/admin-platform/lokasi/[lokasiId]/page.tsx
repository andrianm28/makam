import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lokasiFacilities } from "@/domain/lokasi";
import { formatWib } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { lokasiStatusLabels } from "../../../lokasi/labels";
import {
  AgreementForm,
  BankAccountForm,
  DocumentsForm,
  InviteAdminLokasiForm,
  PoliciesForm,
  ProfileForm,
  RemoveAdminLokasiForm,
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

/** Admin Platform: one Lokasi Mitra's onboarding record. */
export default async function LokasiMitraPage({ params }: PageProps<"/staf/admin-platform/lokasi/[lokasiId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi } = serverRuntime();
  const [read, admins] = await Promise.all([lokasi.lokasiMitra(actor, lokasiId), lokasi.adminLokasiOf(actor, lokasiId)]);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf");
  }
  const lokasiMitra = read.lokasiMitra;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/staf/admin-platform/lokasi" className="text-sm underline underline-offset-4">
          Semua Lokasi Mitra
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{lokasiMitra.name}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary" data-testid="status-lokasi">
            {lokasiStatusLabels[lokasiMitra.status]}
          </Badge>
          <Link href={`/staf/admin-platform/lokasi/${lokasiMitra.id}/audit-log`} className="underline underline-offset-4">
            Audit Log Lokasi
          </Link>
        </div>
      </div>

      <Section id="profil" title="Profil" description="Pengelola, alamat, kota / kabupaten, pin peta dan fasilitas.">
        <ProfileForm lokasiMitra={lokasiMitra} facilities={facilityOptions} />
      </Section>

      <Section id="perjanjian" title="Perjanjian" description="Scan perjanjian kerja sama yang ditandatangani, dan tanggalnya.">
        {lokasiMitra.agreement.scanUploaded ? (
          <p className="text-sm">
            Ditandatangani {lokasiMitra.agreement.signedOn}.{" "}
            <a
              href={`/staf/lokasi/${lokasiMitra.id}/perjanjian`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Lihat scan perjanjian
            </a>{" "}
            <span className="text-muted-foreground">(tautan berlaku 5 menit)</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada scan perjanjian.</p>
        )}
        <AgreementForm lokasiId={lokasiMitra.id} signedOn={lokasiMitra.agreement.signedOn} />
      </Section>

      <Section id="rekening" title="Rekening" description="Rekening tujuan Pencairan. Hanya Admin Platform yang bisa mengubahnya; setiap perubahan tercatat di Audit Log.">
        <BankAccountForm lokasiMitra={lokasiMitra} />
      </Section>

      <Section id="dokumen" title="Dokumen" description="Dokumen yang dibawa keluarga untuk Pemakaman di Lokasi ini.">
        <DocumentsForm lokasiId={lokasiMitra.id} documents={lokasiMitra.documentChecklist} />
      </Section>

      <Section id="kebijakan" title="Kebijakan dan flag">
        <PoliciesForm lokasiId={lokasiMitra.id} policies={lokasiMitra.policies} flags={lokasiMitra.flags} />
      </Section>

      <Section
        id="admin-lokasi"
        title="Admin Lokasi"
        description="Semua Admin Lokasi sama kedudukannya. Undangan dikirim lewat WhatsApp dan berlaku 7 hari; peran didapat saat ia masuk dengan nomor itu."
      >
        {admins.ok && admins.adminLokasi.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {admins.adminLokasi.map((admin) => (
              <li key={admin.accountId} className="flex flex-wrap items-center gap-3">
                <span>
                  {admin.phoneNumber} · {admin.email ?? "–"}
                </span>
                <RemoveAdminLokasiForm lokasiId={lokasiMitra.id} accountId={admin.accountId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada Admin Lokasi.</p>
        )}
        {admins.ok && admins.openInvites.length > 0 ? (
          <div className="text-sm">
            <p className="font-medium">Undangan terbuka</p>
            <ul>
              {admins.openInvites.map((invite) => (
                <li key={invite.id}>
                  {invite.phoneNumber} · {invite.email} · berlaku sampai {formatWib(invite.expiresAt)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <InviteAdminLokasiForm lokasiId={lokasiMitra.id} />
      </Section>
    </>
  );
}
