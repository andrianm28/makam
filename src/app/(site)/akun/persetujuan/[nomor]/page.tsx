import { notFound } from "next/navigation";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { KonsenForm } from "./konsen-form";

/** The Pemegang Hak's Setujui / Tolak, reached from Perlu tindakan in Akun Saya; only that Akun sees it. */
export default async function PersetujuanPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = await params;
  const actor = await currentActor();
  if (!actor) notFound();
  const menunggu = await serverRuntime().pemesanan.konsenMenungguSaya({ accountId: actor.accountId });
  const satu = menunggu.find((item) => item.nomor === nomor);
  if (!satu) notFound();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Persetujuan pemakaman</h1>
      <p>
        {satu.pemesanName} meminta izin Anda sebagai Pemegang Hak untuk memakamkan {satu.almarhumName} di {satu.lokasiName}.
      </p>
      <KonsenForm nomor={satu.nomor} />
    </main>
  );
}
