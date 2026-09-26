import { akunResource, authorize } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { PushPanelClient } from "./push-panel-client";

/**
 * The staff area's install hint and push switch for the browser in use, shown
 * to a signed-in Akun Staf (an Admin Platform once past TOTP). Peringatan Staf
 * go by push to each Perangkat Push and by email.
 */
export async function PushPanel() {
  const actor = await currentActor();
  if (!actor || !authorize(actor, "akun.push", akunResource(actor.accountId)).allowed) return null;
  const { env, notifications } = serverRuntime();
  const devices = await notifications.pushDevices(actor.accountId);
  return (
    <PushPanelClient
      vapidPublicKey={env.vapid.publicKey}
      knownEndpoints={devices.map((device) => device.endpoint)}
    />
  );
}
