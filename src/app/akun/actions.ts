"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/server/guard";
import { currentActor, endCurrentSession } from "@/server/session";

/** Keluar: ends the Pemesan's session and goes back to Masuk. */
export async function keluar(): Promise<void> {
  const result = await guarded({
    actor: await currentActor(),
    action: "akun.keluar",
    resource: (actor) => ({ kind: "akun", accountId: actor.accountId }),
    schema: z.object({}),
    input: {},
    run: () => endCurrentSession(),
  });
  if (!result.ok && result.error !== "belum_masuk") throw new Error(`Keluar refused: ${result.error}`);
  redirect("/masuk");
}
