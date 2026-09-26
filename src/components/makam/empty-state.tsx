import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What a list, tab or panel shows when there is nothing in it, or when it
 * failed to load (tone="error"). It says what would appear here and offers the
 * one action that fills it. Errors say what went wrong and how to retry; they
 * never apologise.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "empty",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "empty" | "error";
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center",
        tone === "error" && "border-solid border-danger/30 bg-danger-soft/40",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full",
          tone === "error" ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-title-3 text-foreground">{title}</p>
        {description ? <p className="text-small text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
