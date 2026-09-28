import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { PerluTindakanItem } from "@/lib/perlu-tindakan";

/**
 * Akun Saya's Perlu Tindakan strip (spec, story 99): renders whatever
 * `perluTindakanDariPesanan` (the registry) built, nothing while it built
 * nothing — no empty banner, and no business rule of its own.
 */
export function PerluTindakanStrip({ items }: { items: readonly PerluTindakanItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Perlu tindakan Anda" className="flex flex-col gap-3 rounded-xl bg-warning-soft p-4 text-warning-soft-foreground">
      <h2 className="flex items-center gap-2 text-body font-semibold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Perlu tindakan Anda
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="block rounded-lg bg-card/60 px-3 py-2 text-body underline-offset-4 hover:underline">
              <span className="font-medium text-foreground">{item.judul}.</span> <span className="text-muted-foreground">{item.deskripsi}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
