import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import { pilUtama } from "@/components/site/gaya";
import type { CsContact } from "@/components/kode-masuk/state";
import { formatTelepon } from "@/lib/format-telepon";
import { cn } from "@/lib/utils";

/**
 * The white card beside a page's title band (PageHero's `samping`): a person to talk to, on WhatsApp once Pengaturan
 * Operator holds the CS number, and Hubungi Kami before then. WhatsApp is the CS only; every order stays on the platform.
 */
export function KartuCs({ contact, judul = "Butuh bantuan sekarang?", isi, pesan }: { contact: CsContact | null; judul?: string; isi?: string; pesan?: string }) {
  return (
    <aside className="flex flex-col gap-4 rounded-3xl bg-card p-7 shadow-lg md:p-8">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-forest" aria-hidden>
        <MessageCircleIcon className="size-7" />
      </span>
      <h2 className="font-heading text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">{judul}</h2>
      <p className="text-lg text-muted-foreground">{isi ?? "Ceritakan kebutuhan keluarga Anda. CS kami membantu menjawab dan mengarahkan langkah berikutnya."}</p>
      {contact ? (
        <>
          <CsLink contact={contact} pesan={pesan} className={cn(pilUtama, "w-full no-underline hover:no-underline")}>
            <MessageCircleIcon className="size-5" aria-hidden="true" /> Chat WhatsApp CS
          </CsLink>
          <p className="text-body text-muted-foreground">
            {formatTelepon(contact.whatsApp)} · {contact.replyHours}
          </p>
        </>
      ) : (
        <Link href="/hubungi-kami" className={cn(pilUtama, "w-full")}>
          Hubungi Kami
        </Link>
      )}
    </aside>
  );
}
