import { cn } from "@/lib/utils";
import { lokasiStatusLabels } from "@/lib/lokasi-labels";

/**
 * The one status vocabulary. Every domain status shown to staff maps to a
 * label (CONTEXT.md) and a tone. Tones carry meaning, never decoration:
 *  - success: done and in good standing
 *  - warning: needs attention soon, or restricted
 *  - danger:  past a deadline, act now
 *  - info:    waiting on someone else
 *  - neutral: not started, or ended for good
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const statusVocabulary = {
  belum_tayang: { label: lokasiStatusLabels.belum_tayang, tone: "neutral" },
  terverifikasi: { label: lokasiStatusLabels.terverifikasi, tone: "success" },
  ditangguhkan: { label: lokasiStatusLabels.ditangguhkan, tone: "warning" },
  berhenti: { label: lokasiStatusLabels.berhenti, tone: "neutral" },
  terlambat: { label: "Terlambat", tone: "danger" },
  lunas: { label: "Lunas", tone: "success" },
  belum_dibayar: { label: "Belum Dibayar", tone: "warning" },
  diajukan: { label: "Diajukan", tone: "info" },
  dikonfirmasi: { label: "Dikonfirmasi", tone: "success" },
  // A Pemesanan Terencana that has been paid: its Hak Pakai runs (ticket 37).
  aktif: { label: "Aktif", tone: "success" },
  dimakamkan: { label: "Dimakamkan", tone: "success" },
  selesai: { label: "Selesai", tone: "success" },
  ditolak: { label: "Ditolak", tone: "warning" },
  dibatalkan: { label: "Dibatalkan", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export type StatusKey = keyof typeof statusVocabulary;

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-neutral-soft text-neutral-soft-foreground [--dot:var(--muted-foreground)]",
  info: "bg-info-soft text-info-soft-foreground [--dot:var(--info)]",
  success: "bg-success-soft text-success-soft-foreground [--dot:var(--success)]",
  warning: "bg-warning-soft text-warning-soft-foreground [--dot:var(--warning)]",
  danger: "bg-danger-soft text-danger-soft-foreground [--dot:var(--danger)]",
};

/**
 * A domain status as a small label with a tone dot. The label text always
 * carries the meaning, so colour is never the only signal. Ended states
 * (Berhenti) use a hollow dot.
 */
export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const { label, tone } = statusVocabulary[status];
  const hollow = status === "berhenti";
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-md px-2 text-caption font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          hollow ? "bg-transparent ring-1 ring-(--dot) ring-inset" : "bg-(--dot)",
        )}
      />
      {label}
    </span>
  );
}
