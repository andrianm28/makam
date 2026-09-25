import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { lokasiStatusLabels } from "../../lokasi/labels";
import { CreateLokasiForm } from "./lokasi-forms";

/** Admin Platform: every Lokasi Mitra, and the start of a new onboarding record. */
export default async function LokasiMitraListPage() {
  const actor = await staffMenuActor("admin_platform");
  const all = await serverRuntime().lokasi.allLokasiMitra(actor);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Lokasi Mitra</h1>

      <Card>
        <CardHeader>
          <CardTitle>Lokasi Mitra baru</CardTitle>
          <CardDescription>
            Lokasi Mitra baru berstatus Belum Tayang. Lengkapi profil, perjanjian, rekening, kebijakan dan Admin Lokasi di
            halamannya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateLokasiForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semua Lokasi Mitra</CardTitle>
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada Lokasi Mitra.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kota / kabupaten</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((lokasi) => (
                  <TableRow key={lokasi.id}>
                    <TableCell>
                      <Link href={`/staf/admin-platform/lokasi/${lokasi.id}`} className="underline underline-offset-4">
                        {lokasi.name}
                      </Link>
                    </TableCell>
                    <TableCell>{lokasi.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lokasiStatusLabels[lokasi.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
