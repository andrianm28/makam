"use client";

/*
 * PROTOTYPE, throwaway. Forms for the Denah editor's dialogs: a new Blok,
 * bulk "Atur Jenis Makam", "Buat Kavling" (with the adjacency refusal shown
 * inline), and "Ubah nomor".
 */
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, Field, fieldInputClass } from "./dialog";
import {
  type Blok,
  type BlokBaruInput,
  type Lokasi,
  cekBlokBaru,
  cekKavling,
  nomorDariPola,
  nomorKavlingBerikut,
  polaKavling,
  polaSah,
} from "./model";

const selectClass = fieldInputClass + " appearance-none bg-[image:none]";

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className="inline-flex h-11 items-center justify-center rounded-lg bg-forest px-4 text-body font-medium text-primary-foreground hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-body font-medium text-foreground hover:bg-accent" {...props}>
      {children}
    </button>
  );
}

function Refusal({ alasan }: { alasan: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-body text-danger-soft-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {alasan}
    </p>
  );
}

export function NewBlokDialog({ open, onOpenChange, lokasi, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; lokasi: Lokasi; onCreate: (input: BlokBaruInput) => void }) {
  const [nama, setNama] = useState("");
  const [baris, setBaris] = useState(8);
  const [kolom, setKolom] = useState(10);
  const [pola, setPola] = useState("{nn}");
  const [polaTouched, setPolaTouched] = useState(false);
  const [jenisMakam, setJenisMakam] = useState(lokasi.jenisMakam.find((j) => j.untuk === "petak")?.id ?? "");
  const [submitted, setSubmitted] = useState(false);

  const input: BlokBaruInput = { nama, baris, kolom, pola: `${nama.trim() || "?"}-${pola}`, jenisMakam };
  const err = cekBlokBaru(lokasi, input);
  // Nothing is wrong yet on a blank, untouched form: only show the name
  // error once there is a name to judge, or the person tried to submit.
  const shownErr = { ...err, nama: nama.trim() || submitted ? err.nama : undefined };

  function ubahNama(v: string) {
    setNama(v);
    if (!polaTouched) setPola("{nn}");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setNama("");
          setBaris(8);
          setKolom(10);
          setPola("{nn}");
          setPolaTouched(false);
          setSubmitted(false);
        }
      }}
    >
      <DialogContent title="Blok baru" description="Setiap sel dimulai sebagai Petak Makam; ubah jadi Jalan atau Bukan Petak setelah dibuat.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (Object.keys(err).length) return;
            onCreate(input);
            onOpenChange(false);
          }}
        >
          <Field id="blok-nama" label="Nama Blok" error={shownErr.nama}>
            <input id="blok-nama" className={fieldInputClass} placeholder="A, Melati, …" value={nama} onChange={(e) => ubahNama(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="blok-baris" label="Baris">
              <input id="blok-baris" type="number" min={1} max={40} className={fieldInputClass} value={baris} onChange={(e) => setBaris(Number(e.target.value) || 1)} />
            </Field>
            <Field id="blok-kolom" label="Kolom">
              <input id="blok-kolom" type="number" min={1} max={40} className={fieldInputClass} value={kolom} onChange={(e) => setKolom(Number(e.target.value) || 1)} />
            </Field>
          </div>
          <Field id="blok-pola" label="Pola Nomor Makam" hint={`Contoh hasil: ${polaSah(input.pola) ? nomorDariPola(input.pola, 1) : "-"}`} error={err.ukuran ?? err.pola}>
            <div className="flex items-center gap-2">
              <span className="text-body text-muted-foreground">{(nama.trim() || "?") + "-"}</span>
              <input
                id="blok-pola"
                className={fieldInputClass}
                value={pola}
                onChange={(e) => {
                  setPolaTouched(true);
                  setPola(e.target.value);
                }}
                placeholder="{nn}"
              />
            </div>
          </Field>
          <Field id="blok-jenis" label="Jenis Makam awal">
            <select id="blok-jenis" className={selectClass} value={jenisMakam} onChange={(e) => setJenisMakam(e.target.value)}>
              {lokasi.jenisMakam
                .filter((j) => j.untuk === "petak")
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={Object.keys(err).length > 0}>Buat Blok</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AturJenisMakamDialog({
  open,
  onOpenChange,
  lokasi,
  jumlah,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lokasi: Lokasi;
  jumlah: number;
  onSubmit: (jenisMakam: string) => void;
}) {
  const [jenisMakam, setJenisMakam] = useState(lokasi.jenisMakam.find((j) => j.untuk === "petak")?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Atur Jenis Makam" description={`Berlaku untuk ${jumlah} sel Petak Makam yang dipilih; Jalan dan Bukan Petak dilewati.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(jenisMakam);
            onOpenChange(false);
          }}
        >
          <Field id="atur-jenis" label="Jenis Makam">
            <select id="atur-jenis" className={selectClass} value={jenisMakam} onChange={(e) => setJenisMakam(e.target.value)} autoFocus>
              {lokasi.jenisMakam
                .filter((j) => j.untuk === "petak")
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton>Terapkan</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KavlingDialog({
  open,
  onOpenChange,
  lokasi,
  blok,
  ids,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lokasi: Lokasi;
  blok: Blok;
  ids: string[];
  onSubmit: (nomor: string, jenisMakam: string) => void;
}) {
  const cek = useMemo(() => cekKavling(blok, ids), [blok, ids]);
  const [nomor, setNomor] = useState(() => nomorKavlingBerikut(blok, lokasi));
  const [jenisMakam, setJenisMakam] = useState(lokasi.jenisMakam.find((j) => j.untuk === "kavling")?.id ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setNomor(nomorKavlingBerikut(blok, lokasi));
      }}
    >
      <DialogContent title="Buat Kavling Keluarga" description={`Dari ${ids.length} sel yang dipilih di ${blok.nama}, dijual dan diberi Hak Pakai sebagai satu unit.`}>
        {!cek.ok ? (
          <Refusal alasan={cek.alasan} />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(nomor, jenisMakam);
              onOpenChange(false);
            }}
          >
            <Field id="kavling-nomor" label="Nomor Kavling">
              <input id="kavling-nomor" className={fieldInputClass} value={nomor} onChange={(e) => setNomor(e.target.value)} autoFocus />
            </Field>
            <Field id="kavling-jenis" label="Jenis Makam Kavling" hint={`Pola bawaan: ${polaKavling(blok.pola)}`}>
              <select id="kavling-jenis" className={selectClass} value={jenisMakam} onChange={(e) => setJenisMakam(e.target.value)}>
                {lokasi.jenisMakam
                  .filter((j) => j.untuk === "kavling")
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
              <PrimaryButton disabled={!nomor.trim() || !jenisMakam}>Buat Kavling</PrimaryButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UbahNomorDialog({
  open,
  onOpenChange,
  blok,
  jumlah,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blok: Blok;
  jumlah: number;
  onSubmit: (pola: string, mulai: number) => void;
}) {
  const [pola, setPola] = useState(blok.pola);
  const [mulai, setMulai] = useState(1);
  const sah = polaSah(pola);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Ubah nomor" description={`Menomori ulang ${jumlah} Petak Makam yang dipilih, berurutan dari kiri atas.`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sah) return;
            onSubmit(pola, mulai);
            onOpenChange(false);
          }}
        >
          <Field id="ubah-pola" label="Pola nomor" hint={sah ? `Contoh: ${nomorDariPola(pola, mulai)}` : undefined} error={!sah ? "Pola perlu tempat nomor urut, misalnya {nn}." : undefined}>
            <input id="ubah-pola" className={fieldInputClass} value={pola} onChange={(e) => setPola(e.target.value)} autoFocus />
          </Field>
          <Field id="ubah-mulai" label="Mulai dari">
            <input id="ubah-mulai" type="number" min={1} className={fieldInputClass} value={mulai} onChange={(e) => setMulai(Number(e.target.value) || 1)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => onOpenChange(false)}>Batal</GhostButton>
            <PrimaryButton disabled={!sah}>Terapkan</PrimaryButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
