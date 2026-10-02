import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { authorize, pemesananResource } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { SuratKuasaDokumen } from "./surat-kuasa-dokumen";

export const metadata: Metadata = {
  title: "Surat Kuasa · Makam.co.id",
  robots: { index: false, follow: false },
};

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/**
 * The Surat Kuasa the Pemegang Hak signs (spec, Pengurusan > Surat Kuasa generator; ticket 46): authority to
 * PT Jaya Korpora Prima, represented by the filing staff member, to file the IPTM. A document page the
 * Pemesan prints (browser "Cetak") or downloads as a PDF (`./pdf`); its own Pemesan only.
 */
export default async function SuratKuasaPage({ params }: PageProps<"/pengurusan/[nomor]/surat-kuasa">) {
  const nomor = nomorSchema.safeParse((await params).nomor);
  if (!nomor.success) notFound();
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (!authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed) notFound();
  const surat = await serverRuntime().pengurusan.suratKuasa({ accountId: actor.accountId }, nomor.data);
  if (!surat) notFound();

  return <SuratKuasaDokumen surat={surat} />;
}
