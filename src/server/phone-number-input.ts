import { z } from "zod";

/**
 * The WhatsApp number field of any Server Action form (Masuk, and Kirim in the
 * booking wizards). Only its shape is checked here; the identity module
 * normalises the number and decides whether it is valid (+62 only in v1).
 */
export const phoneNumberInput = z.string().trim().min(1).max(32);
