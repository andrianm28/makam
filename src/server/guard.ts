import type { z } from "zod";
import { authorize, type Action, type Actor, type Resource } from "@/domain/identity";

export type GuardError = "belum_masuk" | "tidak_berwenang" | "input_tidak_valid";

export type Guarded<R> = { ok: true; value: R } | { ok: false; error: GuardError };

/**
 * The body of every signed-in Server Action (AGENTS.md), in this order:
 * 1. authenticate (the caller's actor, resolved from the session cookie);
 * 2. authorize the action on its resource;
 * 3. validate the input with Zod;
 * 4. call the domain module.
 * A caller who is not signed in is rejected before anything else happens.
 */
export async function guarded<S extends z.ZodType, R>(options: {
  actor: Actor | null;
  action: Action;
  resource: (actor: Actor) => Resource;
  schema: S;
  input: unknown;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
}): Promise<Guarded<R>> {
  const { actor } = options;
  if (!actor) return { ok: false, error: "belum_masuk" };

  const authorization = authorize(actor, options.action, options.resource(actor));
  if (!authorization.allowed) return { ok: false, error: authorization.reason };

  const parsed = options.schema.safeParse(options.input);
  if (!parsed.success) return { ok: false, error: "input_tidak_valid" };

  return { ok: true, value: await options.run(actor, parsed.data) };
}
