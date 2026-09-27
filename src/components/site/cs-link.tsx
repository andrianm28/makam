import { MessageCircleIcon } from "lucide-react";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import { cn } from "@/lib/utils";

/**
 * The CS button: a `wa.me` link to the number in Pengaturan Operator, which a
 * person answers in the WhatsApp Business app (ADR 0004: no WhatsApp API, and
 * no promise that a message is read — email is how the platform talks to a
 * family). Rendered null while Pengaturan Operator holds no number, so no page
 * ever shows a link that goes nowhere.
 */
export function CsLink({
  contact,
  className,
  label = "Tanya CS",
  showHours = false,
  hideLabelOnPhone = false,
}: {
  contact: CsContact | null;
  className?: string;
  /** What the link says; the drawer's and a tile's own wording differ. */
  label?: string;
  /** Show the CS's reply hours next to the number (Hubungi Kami does). */
  showHours?: boolean;
  /**
   * The label is only the icon's accessible name on a phone, where the top bar
   * has no room for it — the link is still there and still one tap away, which is
   * the point of a family in a hurry finding a person.
   */
  hideLabelOnPhone?: boolean;
}) {
  if (!contact) return null;
  return (
    <a
      href={csWhatsAppLink(contact)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-(--touch-target) items-center gap-2 rounded-lg font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <MessageCircleIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className={hideLabelOnPhone ? "sr-only sm:not-sr-only" : undefined}>
        {label}
        {showHours ? <span className="font-normal text-muted-foreground"> · {contact.replyHours}</span> : null}
      </span>
    </a>
  );
}
