"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { pushSubscriptionSchema } from "@/domain/notifications";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { guardMessage } from "./messages";

export type PushActionResult = { ok: true } | { ok: false; message: string };

/** Turns push on for the browser the Akun Staf is using: stores its subscription as a Perangkat Push. */
export async function aktifkanPush(subscription: unknown): Promise<PushActionResult> {
  const result = await guarded({
    action: "akun.push",
    resource: (actor) => akunResource(actor.accountId),
    schema: pushSubscriptionSchema,
    input: subscription,
    run: (actor, data) => serverRuntime().notifications.enablePush(actor, { subscription: data }),
  });
  if (!result.ok) return { ok: false, message: guardMessage(result.error) };
  if (!result.value.ok) {
    return {
      ok: false,
      message:
        result.value.reason === "langganan_tidak_valid"
          ? "Browser ini memberi data push yang tidak dikenali."
          : "Anda tidak berwenang melakukan ini.",
    };
  }
  revalidatePath("/staf", "layout");
  return { ok: true };
}

/** Turns push off for the browser the Akun Staf is using. */
export async function matikanPush(endpoint: unknown): Promise<PushActionResult> {
  const result = await guarded({
    action: "akun.push",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ endpoint: z.url().max(2048) }),
    input: { endpoint },
    run: (actor, data) => serverRuntime().notifications.disablePush(actor, data),
  });
  if (!result.ok) return { ok: false, message: guardMessage(result.error) };
  if (!result.value.ok) return { ok: false, message: "Anda tidak berwenang melakukan ini." };
  revalidatePath("/staf", "layout");
  return { ok: true };
}
