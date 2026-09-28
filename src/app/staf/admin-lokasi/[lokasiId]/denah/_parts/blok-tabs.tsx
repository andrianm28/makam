"use client";

/**
 * The Denah's Blok tabs: one real route per Blok (so a Blok's grid is always
 * server-rendered from the database, never client state), styled 1:1 with
 * ticket 13's prototype tab bar, plus a dashed "Blok baru" tab that opens
 * `NewBlokDialog`.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewBlokDialog } from "./blok-dialogs";

interface BlokTab {
  id: string;
  name: string;
}

export function BlokTabs({
  lokasiId,
  bloks,
  activeBlokId,
  jenisMakam,
}: {
  lokasiId: string;
  bloks: BlokTab[];
  activeBlokId?: string;
  jenisMakam: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Blok">
      {bloks.map((blok) => (
        <Link
          key={blok.id}
          href={`/staf/admin-lokasi/${lokasiId}/denah/${blok.id}`}
          role="tab"
          aria-selected={blok.id === activeBlokId}
          className={cn(
            "inline-flex h-11 shrink-0 items-center rounded-xl border px-4 text-body font-medium",
            blok.id === activeBlokId ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
          )}
        >
          Blok {blok.name}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-4 text-body font-medium text-muted-foreground hover:border-forest hover:text-forest"
      >
        <Plus className="size-4" aria-hidden /> Blok baru
      </button>
      <NewBlokDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lokasiId={lokasiId}
        jenisMakam={jenisMakam}
        onCreated={(blokId) => router.push(`/staf/admin-lokasi/${lokasiId}/denah/${blokId}`)}
      />
    </div>
  );
}
