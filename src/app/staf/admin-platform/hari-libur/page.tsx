import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authorize, hariLiburNasionalResource } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { AddHariLiburForm, RemoveHariLiburForm } from "./hari-libur-forms";

/** Admin Platform keeps the Hari Libur Nasional list of the Admin Platform Hari Kerja calendar. */
export default async function HariLiburPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "hari_libur.ubah", hariLiburNasionalResource()).allowed) redirect("/staf");
  const daftar = await serverRuntime().lokasi.hariLiburNasional();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Hari Libur Nasional</h1>
      <Card>
        <CardHeader>
          <CardTitle>Hari Kerja Admin Platform</CardTitle>
          <CardDescription>
            Hari Kerja Admin Platform adalah Senin–Jumat, kecuali tanggal di daftar ini. Setiap tenggat &quot;N Hari Kerja&quot;
            (transfer refund, Pencairan, Setor Retribusi, dan lainnya) berakhir pukul 23:59 WIB pada Hari Kerja itu. Hari
            kerja Lokasi Mitra mengikuti Jam Operasional masing-masing, bukan daftar ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AddHariLiburForm />
          {daftar.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada Hari Libur Nasional.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {daftar.map((libur) => (
                <li key={libur.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono">{libur.date}</span> · {libur.name}
                  </span>
                  <RemoveHariLiburForm date={libur.date} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
