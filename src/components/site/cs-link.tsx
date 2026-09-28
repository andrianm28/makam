import type { ReactNode } from "react";
import { MessageCircleIcon } from "lucide-react";
import { csWhatsAppLink, type CsContact } from "@/components/kode-masuk/state";
import { cn } from "@/lib/utils";

/**
 * The CS button: a `wa.me` link to the number in Pengaturan Operator, which a
 * person answers in the WhatsApp Business app (ADR 0004: no WhatsApp API, and
 * no promise that a message is read — email is how the platform talks to a
 * family). Rendered null while Pengaturan Operator holds no number, so no page
 * ever shows a link that goes nowhere.
 *
 * Every `wa.me` CS link on the public site (the tiles, the CS band, the
 * floating button, the drawer, the footer) goes through here for the
 * href/target/rel and the contact-null check, even where the default look
 * below doesn't fit: a call site that passes `children` takes over the
 * link's markup, and its `className` then replaces the default look
 * entirely instead of merging onto it, so it keeps its own exact classes.
 */
export function CsLink({
  contact,
  className,
  label = "Tanya CS",
  showHours = false,
  hideLabelOnPhone = false,
  "aria-label": ariaLabel,
  children,
}: {
  contact: CsContact | null;
  /** Merged onto the default look, unless `children` is given — see above. */
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
  /** The link's accessible name, for a call site whose own markup has none. */
  "aria-label"?: string;
  /** Replaces the default icon and label with the call site's own markup. */
  children?: ReactNode;
}) {
  if (!contact) return null;
  return (
    <a
      href={csWhatsAppLink(contact)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={
        children
          ? className
          : cn(
              "inline-flex min-h-(--touch-target) items-center gap-2 rounded-lg font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
              className,
            )
      }
    >
      {children ?? (
        <>
          <MessageCircleIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className={hideLabelOnPhone ? "sr-only sm:not-sr-only" : undefined}>
            {label}
            {showHours ? <span className="font-normal text-muted-foreground"> · {contact.replyHours}</span> : null}
          </span>
        </>
      )}
    </a>
  );
}
