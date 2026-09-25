import "server-only";
import { headers } from "next/headers";
import { z } from "zod";

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/** What the per-IP limits count when the header is missing or malformed: all such requests share one bucket. */
export const UNKNOWN_IP = "tidak-diketahui";

/**
 * The caller's IP for the per-IP limits on emailed codes, from `X-Real-IP`.
 * The host's nginx sets it to `$remote_addr` on every proxied request
 * (deploy/nginx/*-proxy.conf), overwriting anything the client sent, and the
 * web container listens only on 127.0.0.1 behind it, so only nginx's value
 * reaches the app. `X-Forwarded-For` is not read: nginx appends to it, so its
 * first entry is whatever the client claimed.
 */
export async function clientIp(): Promise<string> {
  const value = (await headers()).get("x-real-ip")?.trim();
  return value && ipSchema.safeParse(value).success ? value : UNKNOWN_IP;
}
