import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One number on a dashboard, with what it counts and the one fact that says
 * whether to act. `attention` marks a number that needs someone today; it
 * tints the note, never the whole card. Link it to the list it counts.
 */
export function StatCard({
  label,
  value,
  note,
  attention,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  attention?: "warning" | "danger";
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-small text-muted-foreground">{label}</p>
      <p className="text-display text-foreground tabular-nums">{value}</p>
      {note ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-small",
            attention === "danger" && "text-danger-soft-foreground",
            attention === "warning" && "text-warning-soft-foreground",
            !attention && "text-muted-foreground",
          )}
        >
          {attention ? (
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", attention === "danger" ? "bg-danger" : "bg-warning")}
            />
          ) : null}
          {note}
        </p>
      ) : null}
    </>
  );
  const shared = cn(
    "flex flex-col gap-1 rounded-lg border border-border bg-card p-5 text-card-foreground",
    className,
  );
  if (!href) return <div data-slot="stat-card" className={shared}>{body}</div>;
  return (
    <Link
      data-slot="stat-card"
      href={href}
      className={cn(
        shared,
        "transition-colors duration-(--duration-fast) outline-none hover:border-border-strong hover:bg-subtle focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  );
}
