import type { Database } from "@/db/client";
import { createAuditLog, type AuditLog } from "@/domain/audit";
import { createIdentity, type Identity } from "@/domain/identity";
import type { RuntimeEnv } from "@/lib/env";
import type { Adapters } from "@/ports";

/**
 * Wires the Audit Log and the identity module on one database: shared by the
 * `web` runtime (src/server/runtime.ts) and the ops CLIs (seed:admin, reset-totp).
 */
export function composeIdentity(deps: { env: RuntimeEnv; db: Database; adapters: Adapters }): {
  audit: AuditLog;
  identity: Identity;
} {
  const audit = createAuditLog({ db: deps.db, clock: deps.adapters.clock });
  const identity = createIdentity({
    db: deps.db,
    clock: deps.adapters.clock,
    whatsapp: deps.adapters.whatsapp,
    files: deps.adapters.files,
    audit,
    secret: deps.env.AUTH_SECRET,
    totpEncryptionKey: deps.env.TOTP_ENCRYPTION_KEY,
    baseURL: deps.env.APP_BASE_URL,
  });
  return { audit, identity };
}
