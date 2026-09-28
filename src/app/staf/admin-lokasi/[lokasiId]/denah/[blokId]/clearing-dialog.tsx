"use client";

/**
 * The clearing flow (spec, story 128): Tersedia, Tidak Tersedia with a
 * reason, or occupied (a minimal Hak Pakai / Almarhum, or "data menyusul").
 * Not part of ticket 13's prototype (added by ticket 14, after the
 * prototype), so it is restyled to the same dialog chrome as the ported
 * dialogs rather than copied from one.
 */
import { useState } from "react";
import { Dialog, DialogContent, Field, GhostButton, PrimaryButton, fieldInputClass } from "./../_parts/dialog";

export function ClearingDialog({
  open,
  onOpenChange,
  isKavling,
  pending,
  message,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isKavling: boolean;
  pending: boolean;
  message: string | null;
  onSubmit: (input: unknown) => void;
}) {
  const [mode, setMode] = useState<"tersedia" | "tidak_tersedia" | "terisi">("tersedia");
  const [reason, setReason] = useState("");
  const [dataMenyusul, setDataMenyusul] = useState(false);
  const [pemegangHakName, setPemegangHakName] = useState("");
  const [pemegangHakPhone, setPemegangHakPhone] = useState("");
  const [pemegangHakEmail, setPemegangHakEmail] = useState("");
  const [almarhumName, setAlmarhumName] = useState("");
  const [almarhumDate, setAlmarhumDate] = useState("");

  function submit() {
    if (mode === "tersedia") return onSubmit({ mode: "tersedia" });
    if (mode === "tidak_tersedia") return onSubmit({ mode: "tidak_tersedia", reason });
    const pemegangHak = dataMenyusul || !pemegangHakName ? undefined : { name: pemegangHakName, phoneNumber: pemegangHakPhone, email: pemegangHakEmail || undefined };
    // A Kavling's first Pemakaman must name which member Petak it is at; that picker isn't built here yet, so record it separately later.
    const pemakaman = !isKavling && almarhumName && almarhumDate ? { almarhumName, date: almarhumDate } : undefined;
    onSubmit({ mode: "terisi", dataMenyusul, pemegangHak, pemakaman });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Bersihkan" description={`Tandai status ${isKavling ? "Kavling Keluarga" : "Petak"} ini setelah diperiksa di lapangan.`}>
        {message ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-body text-danger-soft-foreground">
            {message}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 text-body">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "tersedia"} onChange={() => setMode("tersedia")} /> Tersedia
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "tidak_tersedia"} onChange={() => setMode("tidak_tersedia")} /> Tidak Tersedia
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "terisi"} onChange={() => setMode("terisi")} /> Sudah terisi (ada Hak Pakai)
          </label>
        </div>
        {mode === "tidak_tersedia" ? (
          <Field id="bersihkan-alasan" label="Alasan">
            <input id="bersihkan-alasan" value={reason} onChange={(event) => setReason(event.target.value)} className={fieldInputClass} />
          </Field>
        ) : null}
        {mode === "terisi" ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" checked={dataMenyusul} onChange={(event) => setDataMenyusul(event.target.checked)} /> Perlu Verifikasi (data menyusul)
            </label>
            {!dataMenyusul ? (
              <>
                <Field id="bersihkan-nama" label="Nama Pemegang Hak">
                  <input id="bersihkan-nama" value={pemegangHakName} onChange={(event) => setPemegangHakName(event.target.value)} className={fieldInputClass} />
                </Field>
                <Field id="bersihkan-telepon" label="Nomor telepon Pemegang Hak">
                  <input id="bersihkan-telepon" value={pemegangHakPhone} onChange={(event) => setPemegangHakPhone(event.target.value)} className={fieldInputClass} />
                </Field>
                <Field id="bersihkan-email" label="Email Pemegang Hak" hint="Jika diketahui">
                  <input id="bersihkan-email" value={pemegangHakEmail} onChange={(event) => setPemegangHakEmail(event.target.value)} className={fieldInputClass} />
                </Field>
              </>
            ) : null}
            {!isKavling ? (
              <>
                <p className="text-small text-muted-foreground">Isi data Almarhum jika sudah diketahui (boleh dikosongkan).</p>
                <Field id="bersihkan-almarhum" label="Nama Almarhum">
                  <input id="bersihkan-almarhum" value={almarhumName} onChange={(event) => setAlmarhumName(event.target.value)} className={fieldInputClass} />
                </Field>
                <Field id="bersihkan-tanggal" label="Tanggal pemakaman">
                  <input id="bersihkan-tanggal" type="date" value={almarhumDate} onChange={(event) => setAlmarhumDate(event.target.value)} className={fieldInputClass} />
                </Field>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
          <PrimaryButton disabled={pending} onClick={submit}>
            {pending ? "Menyimpan…" : "Simpan"}
          </PrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
