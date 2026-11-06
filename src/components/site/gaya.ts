/**
 * The public site's shared button and section classes after the 6 Nov 2026 review (dri: the UI/UX of the reference
 * site, Makam's own brand): rounded-full "pill" actions with a soft shadow, and the eyebrow label over a big heading.
 * Colours are the brand tokens only (Forest primary, Ivory on dark, Sand accent).
 */
export const pilUtama =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-8 text-lg font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
export const pilGaris =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full border-2 border-forest/25 bg-card px-8 text-lg font-bold text-forest transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
/** On a dark photo: the Ivory pill and its outline twin. */
export const pilTerang =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-ivory px-8 text-lg font-bold text-forest shadow-md transition-colors hover:bg-ivory/90 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none";
export const pilTerangGaris =
  "inline-flex h-14 items-center justify-center gap-2 rounded-full border-2 border-ivory/80 px-8 text-lg font-bold text-ivory transition-colors hover:bg-ivory/10 focus-visible:ring-3 focus-visible:ring-sand/60 focus-visible:outline-none";
/** A section's big heading, under its eyebrow. */
export const judulBagian = "font-heading text-3xl font-extrabold tracking-tight text-foreground text-balance md:text-5xl";
