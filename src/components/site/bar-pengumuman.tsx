import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { CsLink } from "@/components/site/cs-link";
import type { CsContact } from "@/components/kode-masuk/state";

/**
 * The thin Forest strip above the top bar (dri, 6 Nov 2026: the reference site's layout, in our own words): one
 * sentence that a person is there to help, and the way to reach them. Before Pengaturan Operator holds a CS number it
 * points to Hubungi Kami instead of a WhatsApp link.
 */
export function BarPengumuman({ contact }: { contact: CsContact | null }) {
  return (
    <div className="bg-forest text-ivory">
      <div className="mx-auto flex max-w-(--page-max-width) flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 text-center text-body md:px-8">
        <p>Keluarga sedang berduka? Tim kami siap membantu mengurus pemakaman, setiap hari.</p>
        {contact ? (
          <CsLink contact={contact} className="min-h-0 font-bold text-sand underline underline-offset-4">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircleIcon className="size-4" aria-hidden="true" /> Chat WhatsApp CS
            </span>
          </CsLink>
        ) : (
          <Link href="/hubungi-kami" className="font-bold text-sand underline underline-offset-4">
            Hubungi Kami
          </Link>
        )}
      </div>
    </div>
  );
}
