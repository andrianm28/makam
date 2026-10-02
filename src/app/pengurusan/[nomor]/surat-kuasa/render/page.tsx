import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { suratKuasaRenderSah } from "@/lib/surat-kuasa-link";
import { serverRuntime } from "@/server/runtime";
import { SuratKuasaDokumen } from "../surat-kuasa-dokumen";

export const metadata: Metadata = {
  title: "Surat Kuasa · Makam.co.id",
  robots: { index: false, follow: false },
};

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

/**
 * The page the PdfRenderer opens to make the Surat Kuasa PDF (ticket 46). Headless Chromium has no
 * session, so the permission is the link signed for this one order, valid for two minutes; anything
 * else is a 404. Never linked for a person: the Pemesan reaches the PDF through `../pdf`.
 */
export default async function SuratKuasaRenderPage({ params, searchParams }: PageProps<"/pengurusan/[nomor]/surat-kuasa/render">) {
  const nomor = nomorSchema.safeParse((await params).nomor);
  if (!nomor.success) notFound();
  const query = await searchParams;
  const { env, adapters, pengurusan } = serverRuntime();
  const pilih = (nilai: string | string[] | undefined) => (typeof nilai === "string" ? nilai : undefined);
  if (!suratKuasaRenderSah(env.AUTH_SECRET, nomor.data, { sampai: pilih(query.sampai), tanda: pilih(query.tanda) }, adapters.clock.now())) notFound();
  const surat = await pengurusan.suratKuasaUntukCetak(nomor.data);
  if (!surat) notFound();
  return <SuratKuasaDokumen surat={surat} />;
}
