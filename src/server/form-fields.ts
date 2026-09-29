/**
 * A form field that was left empty is not sent at all, so an optional field of a Server Action's schema
 * keeps what is on record instead of failing its minimum length. Shared by the forms that correct or
 * approve a record.
 */
export function isi(formData: FormData, name: string): Record<string, string> {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? {} : { [name]: value };
}
