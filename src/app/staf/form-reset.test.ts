import { describe, expect, it } from "vitest";
import { valuesAfterSubmit } from "./form-reset";

/**
 * What a Form-pattern form's fields show once its Server Action has answered.
 * Before ticket 77 each form rode on `<form action={…}>`, which React reset for
 * free; on `onSubmit` + a hand-built FormData nothing resets it, so a saved Hari
 * Libur or a sent Undangan Staf stayed on screen and the next click was a second
 * copy refused by the domain.
 */
describe("a form's fields after its Server Action answers", () => {
  const kosong = { date: "", name: "" };

  it("go back to the values in force once the save went through, so the next entry starts clean", () => {
    expect(valuesAfterSubmit({ status: "berhasil", message: "Hari Libur Nasional ditambahkan." }, kosong)).toEqual(kosong);
    expect(
      valuesAfterSubmit(
        { status: "berhasil", message: "Pengaturan Operator disimpan dan berlaku mulai sekarang." },
        { legalName: "PT Jaya Korpora Prima", reason: "" },
      ),
    ).toEqual({ legalName: "PT Jaya Korpora Prima", reason: "" });
  });

  it("stay as they were after a refusal, so the one field to fix is still there", () => {
    expect(valuesAfterSubmit({ status: "gagal", message: "Tanggal ini sudah ada di daftar." }, kosong)).toBeNull();
  });

  it("are left alone before anything has been submitted", () => {
    expect(valuesAfterSubmit({ status: "idle" }, kosong)).toBeNull();
  });
});
