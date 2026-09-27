import { z } from "zod";

/**
 * The Indonesian error function for inline field errors in the staff area's
 * Form-pattern forms (docs/design-system.md, voice): every shape refusal the
 * shared Zod schema reports shows under its field in Bahasa Indonesia, in
 * `CONTEXT.md` words. Pass it as the parse `error` (e.g.
 * `zodResolver(schema, { error: pesanKesalahan })`). Server-side refusals keep
 * their own messages (the Server Actions are unchanged); this only words the
 * client's inline validation from the same schema.
 */
export function pesanKesalahan(issue: z.core.$ZodRawIssue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.expected === "string" && (issue as { received?: unknown }).received === undefined)
        return "Wajib diisi.";
      return "Isian ini tidak valid, periksa lagi.";
    case "too_small":
      if (issue.origin === "string" && issue.minimum === 1) return "Wajib diisi.";
      if (issue.origin === "string") return `Paling pendek ${issue.minimum} karakter.`;
      return "Nilainya terlalu kecil.";
    case "too_big":
      if (issue.origin === "string") return `Paling panjang ${issue.maximum} karakter.`;
      return "Nilainya terlalu besar.";
    case "invalid_format":
      if (issue.format === "date" || issue.format === "datetime" || issue.format === "date_time")
        return "Isi tanggal yang benar.";
      return "Isian ini tidak valid, periksa lagi.";
    case "invalid_value":
      return "Pilih atau centang bagian ini.";
    case "custom": {
      const message = (issue as { message?: unknown }).message;
      return typeof message === "string" && message.length > 0 && message !== "Invalid input"
        ? message
        : "Periksa lagi isian ini.";
    }
    default:
      return "Periksa lagi isian ini.";
  }
}
