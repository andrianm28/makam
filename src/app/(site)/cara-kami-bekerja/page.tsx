import type { Metadata } from "next";
import { ContentPage, ContentPageFooter, ContentParagraphs } from "@/components/site/content-page";
import { caraKamiBekerjaSections } from "@/lib/content-pages";

export const metadata: Metadata = {
  title: "Cara Kami Bekerja — Makam.co.id",
  description:
    "Tiga hal yang kami janjikan: Lokasi Mitra dikunjungi langsung sebelum ditampilkan, harga di halaman sama dengan Tagihan, dan izin TPU gratis.",
};

/** A heading id from its label, so each section can be named for assistive tech. */
function sectionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Cara Kami Bekerja (spec, Content pages): the three trust claims, one section
 * each, in the order the trust strip on the Beranda promises them. No amount is
 * written here: the price, the fees and the Operator's details are read from
 * their own modules, on the pages that show them.
 */
export default function CaraKamiBekerjaPage() {
  return (
    <ContentPage title="Cara Kami Bekerja" lead="Tiga hal yang bisa Anda cek sendiri, bukan sekadar janji.">
      {caraKamiBekerjaSections.map((section) => (
        <section key={section.label} aria-labelledby={sectionId(section.label)} className="flex flex-col gap-4">
          <h2 id={sectionId(section.label)} className="font-serif text-title-2 font-semibold">
            {section.label}
          </h2>
          <ContentParagraphs paragraphs={section.paragraphs} />
        </section>
      ))}
      <ContentPageFooter current="Cara Kami Bekerja" />
    </ContentPage>
  );
}
