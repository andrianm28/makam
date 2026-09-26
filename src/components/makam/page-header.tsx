import { cn } from "@/lib/utils";

/**
 * The top of every staff page: one h1, an optional status next to it, a
 * one-line description, and the page's actions (primary action last, on the
 * right). Breadcrumbs live in the shell header, not here.
 */
export function PageHeader({
  title,
  description,
  status,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra facts under the description, e.g. a Lokasi's kota and Kontak Siaga. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-title-1 text-foreground">{title}</h1>
          {status}
        </div>
        {description ? <p className="max-w-prose text-body text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
