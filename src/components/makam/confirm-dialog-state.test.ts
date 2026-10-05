import { describe, expect, it } from "vitest";
import { confirmDialogClosed, confirmDialogReducer, type ConfirmDialogEvent, type ConfirmDialogState } from "./confirm-dialog-state";

/** What a staff member does to one ConfirmDialog, in order, from the state it starts in. */
function play(events: ConfirmDialogEvent[], from: ConfirmDialogState = confirmDialogClosed): ConfirmDialogState {
  return events.reduce(confirmDialogReducer, from);
}

const buka: ConfirmDialogEvent = { type: "open_changed", open: true };
const tutup: ConfirmDialogEvent = { type: "open_changed", open: false };
const ketik = (reason: string): ConfirmDialogEvent => ({ type: "reason_typed", reason });

/**
 * The reason a ConfirmDialog asks for before an action that needs one for the Audit Log (ticket 119: the Pulihkan
 * dialog of a Lokasi Mitra opened with the reason typed for Tangguhkan, so the Audit Log could record the wrong one).
 * A reason belongs to one opening of one dialog.
 */
describe("the reason of a ConfirmDialog", () => {
  it("is empty when the dialog opens for the first time", () => {
    expect(play([buka])).toEqual({ open: true, reason: "" });
  });

  it("is what the staff member typed while the dialog is open", () => {
    expect(play([buka, ketik("Alasan penangguhan")])).toEqual({ open: true, reason: "Alasan penangguhan" });
  });

  it("is kept while the dialog closes on the confirming click, because that same click submits it", () => {
    // The confirm button closes the dialog and submits the form in one click; the textarea must still hold the reason then.
    expect(play([buka, ketik("Alasan penangguhan"), tutup])).toEqual({ open: false, reason: "Alasan penangguhan" });
  });

  it("is empty again when a dialog that was cancelled with a reason typed in opens once more", () => {
    expect(play([buka, ketik("Alasan yang dibatalkan"), tutup, buka])).toEqual({ open: true, reason: "" });
  });

  it("is empty when the dialog opens for the next action: Pulihkan after Tangguhkan was confirmed", () => {
    const sesudahTangguhkan = play([buka, ketik("Alasan penangguhan"), tutup]);

    expect(play([buka], sesudahTangguhkan)).toEqual({ open: true, reason: "" });
  });
});
