import "server-only";
import { notFound } from "next/navigation";
import type { z } from "zod";
import { authorize, type Action, type Actor, type Resource } from "@/domain/identity";
import { rilisTerbuka, type Fitur } from "@/lib/rilis";
import { currentActor } from "./session";

/**
 * A closed feature's Server Action answers 404 before anything else: no actor read,
 * no domain call (ADR 0006). `guarded()` does it first when given `fitur`; an
 * action that does not go through `guarded()` calls it itself.
 */
export function gerbangAksi(fitur: Fitur): void {
  if (!rilisTerbuka(fitur)) notFound();
}

export type GuardError = "belum_masuk" | "tidak_berwenang" | "perlu_totp" | "input_tidak_valid";

/**
 * A refused action. `issues` rides along with `input_tidak_valid`, so the form
 * can say which field to fix (the design system's inline errors) without
 * validating the input a second time: the guard is where it was validated.
 */
export type Guarded<R> = { ok: true; value: R } | { ok: false; error: GuardError; issues?: readonly z.core.$ZodIssue[] };

/** Thrown by a Server Action that has no state to return its guard refusal in (e.g. a plain form action). */
export class GuardRejected extends Error {
  constructor(readonly error: GuardError) {
    super(`Server Action refused: ${error}`);
    this.name = "GuardRejected";
  }
}

/**
 * The body of every signed-in Server Action (AGENTS.md), in this order:
 * 1. authenticate: the guard resolves the actor itself from the request's
 *    session cookie (`currentActor()`); a caller cannot hand one in;
 * 2. authorize the action on its resource;
 * 3. validate the input with Zod;
 * 4. call the domain module.
 * A caller who is not signed in is rejected before anything else happens.
 */
export async function guarded<S extends z.ZodType, R>(options: {
  /** The feature (release) this action belongs to; closed, the action answers 404 before step 1. Omitted: Rilis 1. */
  fitur?: Fitur;
  action: Action;
  resource: (actor: Actor) => Resource;
  schema: S;
  input: unknown;
  run: (actor: Actor, data: z.infer<S>) => Promise<R>;
}): Promise<Guarded<R>> {
  if (options.fitur) gerbangAksi(options.fitur);
  const actor = await currentActor();
  if (!actor) return { ok: false, error: "belum_masuk" };

  const authorization = authorize(actor, options.action, options.resource(actor));
  if (!authorization.allowed) return { ok: false, error: authorization.reason };

  const parsed = options.schema.safeParse(options.input);
  if (!parsed.success) return { ok: false, error: "input_tidak_valid", issues: parsed.error.issues };

  return { ok: true, value: await options.run(actor, parsed.data) };
}
