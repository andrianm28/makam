/**
 * A form field that was left empty is not sent at all, so an optional field of a Server Action's schema
 * keeps what is on record instead of failing its minimum length. Shared by the forms that correct or
 * approve a record.
 */
export function isi(formData: FormData, name: string): Record<string, string> {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? {} : { [name]: value };
}

/** The file a form field carries as the `{ body, contentType }` a domain module takes; none when nothing (or an empty file) was chosen. */
export async function berkasDari(formData: FormData, name: string): Promise<{ body: Uint8Array; contentType: string } | undefined> {
  const file = formData.get(name);
  return file instanceof File && file.size > 0 ? { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } : undefined;
}
