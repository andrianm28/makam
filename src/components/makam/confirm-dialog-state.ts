/**
 * What a ConfirmDialog keeps between its openings: whether it is open, and the reason typed into it (the Audit Log
 * needs one for some actions). Plain functions, so the rule is tested without a browser.
 *
 * A reason belongs to one opening of one dialog (ticket 119): every opening starts with an empty reason, so a dialog
 * never carries the reason typed for another action, nor one the staff member cancelled. The reason is forgotten when
 * the dialog opens, never when it closes: the confirming click closes the dialog and submits the form in the same
 * click, and the textarea (the form reads it through its `form` attribute) must still hold the reason at that moment.
 */
export interface ConfirmDialogState {
  open: boolean;
  reason: string;
}

export const confirmDialogClosed: ConfirmDialogState = { open: false, reason: "" };

export type ConfirmDialogEvent = { type: "open_changed"; open: boolean } | { type: "reason_typed"; reason: string };

export function confirmDialogReducer(state: ConfirmDialogState, event: ConfirmDialogEvent): ConfirmDialogState {
  switch (event.type) {
    case "open_changed":
      return event.open ? { open: true, reason: "" } : { ...state, open: false };
    case "reason_typed":
      return { ...state, reason: event.reason };
  }
}
