import "server-only";

/**
 * The "Tambah Layanan" items a form carries as one JSON field (`layananJson`), as the value the Zod schema of the
 * Server Action then validates. Absent or empty means none; text that is not JSON becomes a value the schema
 * refuses, never an exception.
 */
export function layananDariForm(formData: FormData): unknown {
  const mentah = formData.get("layananJson");
  if (typeof mentah !== "string" || mentah.trim() === "") return [];
  try {
    return JSON.parse(mentah);
  } catch {
    return "bukan-json";
  }
}
