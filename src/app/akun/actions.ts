"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { akunResource } from "@/domain/identity";
import { guarded, GuardRejected } from "@/server/guard";
import { endCurrentSession } from "@/server/session";

/**
 * Keluar: ends the Pemesan's session and goes back to Masuk. Goes through the
 * guard like every signed-in Server Action. With no session (already ended)
 * the visitor is sent to Masuk marked `?sesi=berakhir`, distinct from a real
 * Keluar; any other refusal is thrown as GuardRejected.
 */
export async function keluar(): Promise<void> {
  const result = await guarded({
    action: "akun.keluar",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({}),
    input: {},
    run: () => endCurrentSession(),
  });
  if (!result.ok) {
    if (result.error === "belum_masuk") redirect("/masuk?sesi=berakhir");
    throw new GuardRejected(result.error);
  }
  redirect("/masuk");
}
