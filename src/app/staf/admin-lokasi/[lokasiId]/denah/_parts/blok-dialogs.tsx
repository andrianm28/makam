"use client";

/**
 * Dialogs shared by the Denah list (Blok baru, on an empty Lokasi or from a
 * Blok tab) and one Blok's editor (Atur Jenis Makam, Buat Kavling, Ubah
 * nomor). Ported 1:1 from ticket 13's prototype (`pratinjau/denah/_parts/dialogs.tsx`):
 * same fields and copy, wired to the real Server Actions instead of client
 * state, so uniqueness and adjacency are judged server-side and shown through
 * `denahRefusalMessage`, never re-implemented here.
 */
import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, Field, GhostButton, PrimaryButton, fieldInputClass, selectFieldClass } from "./dialog";
import { createBlokAction } from "../actions";

interface JenisMakamOption {
  id: string;
  name: string;
}

function Refusal({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-body text-danger-soft-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {message}
    </p>
  );
}

export function NewBlokDialog({
  open,
  onOpenChange,
  lokasiId,
  jenisMakam,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lokasiId: string;
  jenisMakam: JenisMakamOption[];
  onCreated: (blokId: string) => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(10);
  const [numberPattern, setNumberPattern] = useState("");
  const [jenisMakamId, setJenisMakamId] = useState(jenisMakam[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setRows(8);
    setCols(10);
    setNumberPattern("");
    setJenisMakamId(jenisMakam[0]?.id ?? "");
    setMessage(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent title="Blok baru" description="Setiap sel dimulai sebagai Petak Makam; ubah jadi Jalan atau Bukan Petak setelah dibuat.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await createBlokAction({
                lokasiId,
                name,
                rows,
                cols,
                numberPattern: numberPattern || undefined,
                jenisMakamId,
              });
              if (!result.ok) {
                setMessage(result.message);
                return;
              }
              onOpenChange(false);
              reset();
              onCreated(result.blokId);
            });
          }}
        >
          {message ? <Refusal message={message} /> : null}
          <Field id="blok-nama" label="Nama Blok">
            <input id="blok-nama" className={fieldInputClass} placeholder="A, Melati, …" value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="blok-baris" label="Baris">
              <input id="blok-baris" type="number" min={1} max={40} className={fieldInputClass} value={rows} onChange={(event) => setRows(Number(event.target.value) || 1)} />
            </Field>
            <Field id="blok-kolom" label="Kolom">
              <input id="blok-kolom" type="number" min={1} max={40} className={fieldInputClass} value={cols} onChange={(event) => setCols(Number(event.target.value) || 1)} />
            </Field>
          </div>
          <Field id="blok-pola" label="Pola Nomor Makam" hint={`Kosongkan untuk pola bawaan, mis. ${name.trim() || "A"}-{nn}`}>
            <input id="blok-pola" className={fieldInputClass} value={numberPattern} onChange={(event) => setNumberPattern(event.target.value)} placeholder={`${name.trim() || "A"}-{nn}`} />
          </Field>
          <Field id="blok-jenis" label="Jenis Makam awal">
            <select id="blok-jenis" className={selectFieldClass} value={jenisMakamId} onChange={(event) => setJenisMakamId(event.target.value)} required>
              {jenisMakam.map((jenis) => (
                <option key={jenis.id} value={jenis.id}>
                  {jenis.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={pending || !name.trim() || !jenisMakamId}>{pending ? "Membuat…" : "Buat Blok"}</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AturJenisMakamDialog({
  open,
  onOpenChange,
  jenisMakam,
  jumlah,
  pending,
  message,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jenisMakam: JenisMakamOption[];
  jumlah: number;
  pending: boolean;
  message: string | null;
  onSubmit: (jenisMakamId: string) => void;
}) {
  const [jenisMakamId, setJenisMakamId] = useState(jenisMakam[0]?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Atur Jenis Makam" description={`Berlaku untuk ${jumlah} sel Petak Makam yang dipilih; Jalan, Bukan Petak dan Pintu Masuk dilewati.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(jenisMakamId);
          }}
        >
          {message ? <Refusal message={message} /> : null}
          <Field id="atur-jenis" label="Jenis Makam">
            <select id="atur-jenis" className={selectFieldClass} value={jenisMakamId} onChange={(event) => setJenisMakamId(event.target.value)} autoFocus>
              {jenisMakam.map((jenis) => (
                <option key={jenis.id} value={jenis.id}>
                  {jenis.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={pending || !jenisMakamId}>{pending ? "Menyimpan…" : "Terapkan"}</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KavlingDialog({
  open,
  onOpenChange,
  blokName,
  jenisMakam,
  jumlah,
  pending,
  message,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blokName: string;
  jenisMakam: JenisMakamOption[];
  jumlah: number;
  pending: boolean;
  message: string | null;
  onSubmit: (jenisMakamId: string, nomorKavling: string | undefined) => void;
}) {
  const [jenisMakamId, setJenisMakamId] = useState(jenisMakam[0]?.id ?? "");
  const [nomorKavling, setNomorKavling] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Buat Kavling Keluarga" description={`Dari ${jumlah} sel yang dipilih di Blok ${blokName}, dijual dan diberi Hak Pakai sebagai satu unit.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(jenisMakamId, nomorKavling.trim() || undefined);
          }}
        >
          {message ? <Refusal message={message} /> : null}
          <Field id="kavling-nomor" label="Nomor Kavling" hint="Kosongkan untuk otomatis">
            <input id="kavling-nomor" className={fieldInputClass} value={nomorKavling} onChange={(event) => setNomorKavling(event.target.value)} autoFocus />
          </Field>
          <Field id="kavling-jenis" label="Jenis Makam Kavling">
            <select id="kavling-jenis" className={selectFieldClass} value={jenisMakamId} onChange={(event) => setJenisMakamId(event.target.value)}>
              {jenisMakam.map((jenis) => (
                <option key={jenis.id} value={jenis.id}>
                  {jenis.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={pending || !jenisMakamId}>{pending ? "Menyimpan…" : "Buat Kavling"}</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UbahNomorDialog({
  open,
  onOpenChange,
  defaultPattern,
  jumlah,
  pending,
  message,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPattern: string;
  jumlah: number;
  pending: boolean;
  message: string | null;
  onSubmit: (pattern: string, startAt: number) => void;
}) {
  const [pattern, setPattern] = useState(defaultPattern);
  const [startAt, setStartAt] = useState(1);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Ubah nomor" description={`Menomori ulang ${jumlah} Petak Makam yang dipilih, berurutan dari kiri atas.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(pattern, startAt);
          }}
        >
          {message ? <Refusal message={message} /> : null}
          <Field id="ubah-pola" label="Pola nomor">
            <input id="ubah-pola" className={fieldInputClass} value={pattern} onChange={(event) => setPattern(event.target.value)} autoFocus />
          </Field>
          <Field id="ubah-mulai" label="Mulai dari">
            <input id="ubah-mulai" type="number" min={1} className={fieldInputClass} value={startAt} onChange={(event) => setStartAt(Number(event.target.value) || 1)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={pending || !pattern.trim()}>{pending ? "Menyimpan…" : "Terapkan"}</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
