import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, pengaturanOperatorResource } from "@/domain/identity";
import { formatWib } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { PengaturanOperatorForm } from "./pengaturan-operator-form";

/** Pengaturan Operator: the Admin Platform–only screen for the Operator's own reference values. */
export default async function PengaturanOperatorPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "pengaturan_operator.lihat", pengaturanOperatorResource()).allowed) redirect("/staf");
  const current = await serverRuntime().operatorSettings.current();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Pengaturan Operator</h1>

      <Card>
        <CardHeader>
          <CardTitle>Berlaku sekarang</CardTitle>
          <CardDescription>
            Dipakai di kop setiap Tagihan dan Bukti, halaman Hubungi Kami, tombol CS dan balasan otomatis WhatsApp.
            Dokumen yang sudah terbit tetap memakai nilai yang berlaku saat diterbitkan.
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="pengaturan-berlaku">
          {current ? (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">Nama resmi</dt>
              <dd>{current.legalName}</dd>
              <dt className="text-muted-foreground">Alamat terdaftar</dt>
              <dd className="whitespace-pre-line">{current.address}</dd>
              <dt className="text-muted-foreground">Telepon</dt>
              <dd>{current.phone}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{current.email}</dd>
              <dt className="text-muted-foreground">WhatsApp CS</dt>
              <dd>{current.csWhatsApp}</dd>
              <dt className="text-muted-foreground">Jam balas CS</dt>
              <dd>{current.csReplyHours}</dd>
              <dt className="text-muted-foreground">Berlaku sejak</dt>
              <dd>{formatWib(current.inForceFrom)} WIB</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum diisi. Isi semua nilai di bawah sebelum peluncuran; tidak ada nilai bawaan.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ubah</CardTitle>
          <CardDescription>
            Perubahan berlaku mulai saat disimpan dan tercatat di Audit Log (nilai sebelum dan sesudah).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PengaturanOperatorForm
            values={{
              legalName: current?.legalName ?? "",
              address: current?.address ?? "",
              phone: current?.phone ?? "",
              email: current?.email ?? "",
              csWhatsApp: current?.csWhatsApp ?? "",
              csReplyHours: current?.csReplyHours ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
