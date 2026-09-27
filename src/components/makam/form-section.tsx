import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * One titled section of a Form-pattern page (docs/design-system.md): a
 * section heading with an optional one-line description, then the fields.
 * Pages compose it as PageHeader + one or more FormSection.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-title-2 text-foreground">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-small text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The inline error under one field: nothing when the field is valid. */
export function FieldError({ message, id }: { message: string | undefined; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-small text-destructive">
      {message}
    </p>
  );
}
