import type { Metadata } from "next";
import { ContentPage, ContentPageFooter } from "@/components/site/content-page";
import { faqQuestions } from "@/lib/content-pages";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "FAQ — Makam.co.id",
  description: "Pesan Makam atau Hak Pakai, apa yang dibayar dan kapan, pembatalan, perpanjangan, TPU, dokumen, dan data keluarga.",
};

/** A question as an id for its answer, so each one can be linked to. */
function questionId(question: string): string {
  return `faq-${question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/**
 * FAQ (spec, Content pages): the seven questions this release answers. Every
 * answer states the rule and where to see the amount; the legal name in the
 * answer about payment comes from Pengaturan Operator.
 */
export default async function FaqPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const questions = faqQuestions(settings?.legalName ?? null);

  return (
    <ContentPage title="FAQ" lead="Pertanyaan yang paling sering masuk ke CS kami.">
      <dl className="flex flex-col gap-8">
        {questions.map((entry) => (
          <div key={entry.question} className="flex flex-col gap-2">
            <dt id={questionId(entry.question)} className="text-title-3 font-semibold">
              {entry.question}
            </dt>
            <dd className="text-body-lg leading-relaxed text-muted-foreground">{entry.answer}</dd>
          </div>
        ))}
      </dl>
      <ContentPageFooter current="FAQ" />
    </ContentPage>
  );
}
