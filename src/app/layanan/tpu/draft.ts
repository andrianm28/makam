import { z } from "zod";
// The Layanan module's own Zod-only file, never its barrel (AGENTS.md): this file is on a client component's import graph.
import { FOTO_MAKAM_TPU_MAX_BYTES, placePesananLayananTpuSchema } from "@/domain/layanan/tpu-skema";
import { fileBase64 } from "@/lib/files/base64";

/**
 * What the TPU checkout's Kirim posts: the module's own order plus the optional photo
 * of the grave, which crosses the boundary as base64 (a `File` cannot be an argument
 * of a Server Action call) and is decoded in the action.
 */
export const draftTpuSchema = placePesananLayananTpuSchema.extend({
  foto: z.object({ isi: fileBase64(FOTO_MAKAM_TPU_MAX_BYTES), contentType: z.string().trim().min(1).max(120) }).nullable().default(null),
});
export type DraftTpu = z.input<typeof draftTpuSchema>;
