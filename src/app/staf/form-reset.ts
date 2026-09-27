import { useEffect, useRef } from "react";
import type { FormState } from "./form-state";

/**
 * What a Form-pattern form's fields go back to once its Server Action has
 * answered: after a save that went through, the values in force (an empty form
 * for an entry that is now on the list), so the same person can enter the next
 * one and a second click is not a second copy; after a refusal, nothing at all —
 * the fields keep what was typed, with the one message to fix under the field
 * that caused it.
 *
 * Before ticket 77 the forms rode on `<form action={…}>`, which React reset for
 * free; on `onSubmit` with a hand-built FormData nothing resets them.
 */
export function valuesAfterSubmit<T>(result: FormState, values: T): T | null {
  return result.status === "berhasil" ? values : null;
}

/**
 * `reset` for that, on a form driven by `useActionState` + react-hook-form.
 *
 * `values` is read as a function, at the moment the answer comes in: the caller
 * decides then what the fields should show (the values just saved, an empty
 * form), never a second rule for it. Each answer is acted on once, so a caller
 * whose `values` is built fresh on every render cannot start a
 * render → reset → render loop. `danJuga` clears what `reset` cannot reach, such
 * as a file input's own value.
 */
export function useResetAfterSubmit<T>(
  result: FormState,
  values: () => T,
  reset: (values: T) => void,
  danJuga?: () => void,
) {
  const answered = useRef<FormState | null>(null);
  useEffect(() => {
    if (answered.current === result) return;
    answered.current = result;
    const cleared = valuesAfterSubmit(result, values());
    if (!cleared) return;
    reset(cleared);
    danJuga?.();
  }, [result, values, reset, danJuga]);
}
