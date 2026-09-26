"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { guarded } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";

/** Opening the bell: every Peringatan Staf of the signed-in Akun Staf is read. */
export async function bacaPeringatanStaf(): Promise<{ ok: boolean }> {
  const result = await guarded({
    action: "akun.peringatan",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({}),
    input: {},
    run: (actor) => serverRuntime().notifications.markStaffAlertsRead(actor),
  });
  if (!result.ok || !result.value.ok) return { ok: false };
  revalidatePath("/staf", "layout");
  return { ok: true };
}
