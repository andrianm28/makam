"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { guarded, GuardRejected } from "@/server/guard";
import { endCurrentSession } from "@/server/session";

/**
 * Keluar: ends the Pemesan's session and goes back to Masuk. Goes through the
 * guard like every signed-in Server Action; a refusal (e.g. no session) is
 * thrown as GuardRejected, never passed off as a successful Keluar.
 */
export async function keluar(): Promise<void> {
  const result = await guarded({
    action: "akun.keluar",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({}),
    input: {},
    run: () => endCurrentSession(),
  });
  if (!result.ok) throw new GuardRejected(result.error);
  redirect("/masuk");
}
