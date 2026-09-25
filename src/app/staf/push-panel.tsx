import { akunResource, authorize } from "@/domain/identity";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { PushPanelClient } from "./push-panel-client";

/**
 * The staff area's install hint and push switch for the browser in use, shown
 * to a signed-in Akun Staf (an Admin Platform once past TOTP). Peringatan Staf
 * always go by WhatsApp; push is on top.
 */
export async function PushPanel() {
  const actor = await currentActor();
  if (!actor || !authorize(actor, "akun.push", akunResource(actor.accountId)).allowed) return null;
  const { env, notifications } = serverRuntime();
  const devices = await notifications.pushDevices(actor.accountId);
  return (
    <PushPanelClient
      vapidPublicKey={env.VAPID_PUBLIC_KEY}
      knownEndpoints={devices.map((device) => device.endpoint)}
    />
  );
}
