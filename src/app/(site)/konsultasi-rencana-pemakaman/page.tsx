import type { Metadata } from "next";
import { kontenKedukaan } from "@/lib/kedukaan-konten";
import { HalamanKedukaan } from "../layanan-kedukaan/halaman-kedukaan";

export const metadata: Metadata = {
  title: "Konsultasi Rencana Pemakaman — Makam.co.id",
  description: kontenKedukaan.konsultasi.ringkas,
};

/** Konsultasi Rencana Pemakaman (ADR 0010): the planning counterpart of Pesan Sekarang, a call at the family's chosen time. */
export default async function KonsultasiRencanaPemakamanPage({ searchParams }: { searchParams: Promise<{ nomor?: string }> }) {
  const { nomor } = await searchParams;
  return <HalamanKedukaan konten={kontenKedukaan.konsultasi} nomor={nomor} />;
}
