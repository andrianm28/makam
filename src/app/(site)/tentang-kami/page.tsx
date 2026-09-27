import type { Metadata } from "next";
import { ContentPage, ContentPageFooter, ContentParagraphs } from "@/components/site/content-page";
import { tentangKamiParagrafs } from "@/lib/content-pages";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Tentang Kami — Makam.co.id",
  description: "Apa itu makam.co.id, siapa yang mengelolanya, dan bahwa makam.co.id tidak memiliki tanah makam.",
};

/**
 * Tentang Kami (spec, Content pages): what makam.co.id is, who runs it, and that
 * it holds no land. The legal name is read from Pengaturan Operator, so this page
 * can never disagree with the footer, a Tagihan or Hubungi Kami.
 */
export default async function TentangKamiPage() {
  const settings = await serverRuntime().operatorSettings.current();

  return (
    <ContentPage title="Tentang Kami" lead="Layanan pemakaman yang memisahkan hal yang jelas dari hal yang belum.">
      <ContentParagraphs paragraphs={tentangKamiParagrafs(settings?.legalName ?? null)} />
      <ContentPageFooter current="Tentang Kami" />
    </ContentPage>
  );
}
