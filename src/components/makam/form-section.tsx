import { cn } from "@/lib/utils";

/**
 * One group of related fields in a form. On wide screens the title and
 * description sit in a left column and the fields on the right; on phones
 * they stack. Sections are separated by a rule, not boxed in cards.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="form-section"
      className={cn(
        "grid gap-x-10 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-title-3 text-foreground">{title}</h2>
        {description ? <p className="text-small text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex max-w-xl flex-col gap-5">{children}</div>
    </section>
  );
}
