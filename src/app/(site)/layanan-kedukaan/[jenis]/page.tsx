import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kontenDariSlug } from "@/lib/kedukaan-konten";
import { HalamanKedukaan } from "../halaman-kedukaan";

export async function generateMetadata({ params }: { params: Promise<{ jenis: string }> }): Promise<Metadata> {
  const konten = kontenDariSlug((await params).jenis);
  return konten ? { title: `${konten.judul} — Makam.co.id`, description: konten.ringkas } : {};
}

/** One Layanan Kedukaan and its request form; an unknown one is a 404. */
export default async function LayananKedukaanJenisPage({ params, searchParams }: { params: Promise<{ jenis: string }>; searchParams: Promise<{ nomor?: string }> }) {
  const konten = kontenDariSlug((await params).jenis);
  if (!konten) notFound();
  const { nomor } = await searchParams;
  return <HalamanKedukaan konten={konten} nomor={nomor} />;
}
