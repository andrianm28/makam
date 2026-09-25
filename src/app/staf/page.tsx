import { redirect } from "next/navigation";
import { currentActor } from "@/server/session";
import { homeFor } from "@/server/staff-area";

/** The staff area's start: the TOTP step, or the menu of the first role the Akun holds. */
export default async function StafPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  redirect(homeFor(actor));
}
