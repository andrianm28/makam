import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The interim logo (docs/design-system.md, Logo): a downscaled raster of the
 * conceptual mark from the brand guideline (p. 6, public/brand/makam-mark.png,
 * 45 × 96 px) until the designer's vector master arrives. Shown at 48 px tall
 * or less so it stays sharp on 2× screens.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/makam-mark.png"
      alt=""
      width={45}
      height={96}
      priority
      className={cn("h-8 w-auto shrink-0 select-none", className)}
    />
  );
}

/**
 * The wordmark MAKAM.CO.ID in Plus Jakarta Sans bold beside the mark, with an
 * optional caption (e.g. "Area Staf"). A collapsed sidebar shows the mark alone.
 */
export function BrandLogo({ caption, className }: { caption?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="text-small font-bold tracking-[0.04em] text-forest dark:text-ivory">MAKAM.CO.ID</span>
        {caption ? <span className="text-caption text-muted-foreground">{caption}</span> : null}
      </span>
    </span>
  );
}
