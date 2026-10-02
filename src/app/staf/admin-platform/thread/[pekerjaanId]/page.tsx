import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DaftarPesanThread } from "@/components/layanan/thread-daftar";
import { FormPesanThread } from "@/components/layanan/thread-pesan";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { kirimPesanThreadPlatform } from "./actions";

export const metadata: Metadata = {
  title: "Percakapan pekerjaan | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * The message thread of any Pekerjaan Layanan, for Admin Platform to read and step into (spec, Layanan > Message
 * thread; story 171). Admin Platform only: the Layanan module refuses anyone else.
 */
export default async function ThreadPlatformPage({ params }: PageProps<"/staf/admin-platform/thread/[pekerjaanId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { pekerjaanId } = await params;
  const hasil = await serverRuntime().layanan.bacaThreadStaf(actor, pekerjaanId);
  if (!hasil.ok) notFound();
  return (
    <>
      <PageHeader title={`Percakapan · ${hasil.thread.label}`} description="Pemesan dan pelaksana pekerjaan ini bertukar pesan di sini. Pemesan diberi tahu lewat email, tanpa isi pesan." />
      <Card>
        <CardHeader>
          <CardTitle>Pesan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DaftarPesanThread thread={hasil.thread} />
          {hasil.thread.tertutup ? null : <FormPesanThread pekerjaanId={pekerjaanId} action={kirimPesanThreadPlatform} />}
        </CardContent>
      </Card>
    </>
  );
}
