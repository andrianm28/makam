import type { Metadata } from "next";
import { ContentPage, ContentPageFooter } from "@/components/site/content-page";
import { kebijakanPrivasiSections } from "@/lib/content-pages";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Makam.co.id",
  description: "Data apa yang kami kumpulkan, untuk apa, dengan siapa dibagikan, dan bagaimana Anda meminta data Anda dilihat atau dihapus.",
};

/**
 * Kebijakan Privasi: the copy lives in `content-pages.ts`; the Operator's legal
 * name is read from Pengaturan Operator so this page never disagrees with the
 * footer or a Tagihan.
 */
export default async function KebijakanPrivasiPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const sections = kebijakanPrivasiSections(settings?.legalName ?? null);

  return (
    <ContentPage title="Kebijakan Privasi" lead="Data keluarga Anda dipakai untuk melayani pesanan Anda, bukan untuk hal lain.">
      <div className="flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.label} className="flex flex-col gap-2">
            <h2 className="text-title-3 font-semibold">{section.label}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-body-lg leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <ContentPageFooter current="Kebijakan Privasi" />
    </ContentPage>
  );
}
