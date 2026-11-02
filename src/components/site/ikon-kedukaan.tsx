import { Box, Flower2, Home, MessagesSquare, Package, Plane, Truck, type LucideIcon } from "lucide-react";
import type { IkonKedukaan } from "@/lib/kedukaan-konten";

const ikon: Record<IkonKedukaan, LucideIcon> = {
  home: Home,
  truck: Truck,
  package: Package,
  plane: Plane,
  box: Box,
  flower: Flower2,
  messages: MessagesSquare,
};

/** A Layanan Kedukaan's icon, in a soft brand circle: the pages show icons, never photos of graves (ADR 0010). */
export function IkonKedukaanBulat({ nama, besar = false }: { nama: IkonKedukaan; besar?: boolean }) {
  const Ikon = ikon[nama];
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground ${besar ? "size-16" : "size-12"}`}>
      <Ikon className={besar ? "size-8" : "size-6"} />
    </span>
  );
}
