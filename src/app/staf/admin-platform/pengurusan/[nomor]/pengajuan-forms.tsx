"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "../../../form-state";
import { ajukanIptmAction, buatSuratPengantarAction, catatDimakamkanAction, periksaDokumenAction, terbitkanIptmAction, tolakPtspAction } from "./pengajuan-actions";

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "berhasil" ? "status" : "alert"} className={state.status === "berhasil" ? "text-sm text-success-soft-foreground" : "text-sm text-destructive"}>
      {state.message}
    </p>
  );
}

/** One filing step with nothing to fill in: a button and what it answered. */
function LangkahTombol({ nomor, aksi, judul, keterangan, tombol }: {
  nomor: string;
  aksi: (previous: FormState, formData: FormData) => Promise<FormState>;
  judul: string;
  keterangan: string;
  tombol: string;
}) {
  const [state, action, pending] = useActionState(aksi, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{judul}</CardTitle>
        <CardDescription>{keterangan}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="nomor" value={nomor} />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Menyimpan…" : tombol}
          </Button>
          <Feedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

export type LangkahPengajuan = "catat_dimakamkan" | "periksa_dokumen" | "ajukan_iptm" | "terbitkan_iptm";

/** The one filing step the order is at (spec, Pengurusan): each is one Server Action calling one domain function. */
export function LangkahPengajuanForm({ nomor, langkah, petugas, perluBlokNomor }: {
  nomor: string;
  langkah: LangkahPengajuan;
  petugas: { accountId: string; name: string }[];
  perluBlokNomor: boolean;
}) {
  const [ajukanState, ajukan, mengajukan] = useActionState(ajukanIptmAction, idle);
  const [terbitState, terbit, menerbitkan] = useActionState(terbitkanIptmAction, idle);

  if (langkah === "catat_dimakamkan") {
    return (
      <LangkahTombol
        nomor={nomor}
        aksi={catatDimakamkanAction}
        judul="Catat Dimakamkan"
        keterangan="Setelah Anda memastikan dengan TPU atau keluarga bahwa pemakaman sudah berlangsung. Ini memulai jam pay-after dan batas 7 hari untuk dokumen."
        tombol="Pemakaman sudah berlangsung"
      />
    );
  }
  if (langkah === "periksa_dokumen") {
    return (
      <LangkahTombol
        nomor={nomor}
        aksi={periksaDokumenAction}
        judul="Periksa dokumen"
        keterangan="Dokumen Lengkap hanya bisa dicatat setelah semua berkas keluarga, termasuk Surat Kuasa bertanda tangan, diunggah."
        tombol="Dokumen lengkap"
      />
    );
  }
  if (langkah === "ajukan_iptm") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ajukan IPTM di JakEVO</CardTitle>
          <CardDescription>Pilih Petugas Lapangan bila berkas asli perlu diantar (Tugas Lapangan Berkas IPTM).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={ajukan} className="flex flex-col gap-3">
            <input type="hidden" name="nomor" value={nomor} />
            <label className={labelClass}>
              Petugas Lapangan pembawa berkas asli (opsional)
              <select name="berkasPetugasAccountId" defaultValue="" className={inputClass}>
                <option value="">Tidak perlu</option>
                {petugas.map((akun) => (
                  <option key={akun.accountId} value={akun.accountId}>
                    {akun.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={mengajukan} className="self-start">
              {mengajukan ? "Menyimpan…" : "IPTM diajukan"}
            </Button>
            <Feedback state={ajukanState} />
          </form>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>IPTM terbit</CardTitle>
        <CardDescription>
          Unggah scan IPTM dan tanggal berlakunya. Scan dikirim ke Pemesan dan Pemegang Hak, apa pun status Tagihannya, dan Makam TPU diperbarui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={terbit} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>
            Scan IPTM (JPG, PNG atau PDF)
            <input name="berkas" type="file" accept="image/jpeg,image/png,application/pdf" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Berlaku sampai
            <input name="berlakuSampai" type="date" required className={inputClass} />
          </label>
          {perluBlokNomor ? (
            <label className={labelClass}>
              Blok dan nomor makam sesuai IPTM
              <input name="blokNomor" required maxLength={120} className={inputClass} />
            </label>
          ) : null}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Button type="submit" disabled={menerbitkan} className="self-start">
              {menerbitkan ? "Mengunggah…" : "Terbitkan IPTM"}
            </Button>
            <Feedback state={terbitState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** The Ambil surat pengantar Tugas of a paid filing-only order: a Petugas Lapangan is picked, and the Tugas exists once. */
export function SuratPengantarForm({ nomor, petugas }: { nomor: string; petugas: { accountId: string; name: string }[] }) {
  const [state, action, pending] = useActionState(buatSuratPengantarAction, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ambil surat pengantar</CardTitle>
        <CardDescription>Tagihan sudah Lunas. Pilih Petugas Lapangan yang mengambil surat pengantar dari TPU; pengajuan jatuh tempo 3 hari kerja setelah Lunas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>
            Petugas Lapangan
            <select name="petugasAccountId" required defaultValue="" className={inputClass}>
              <option value="" disabled>Pilih petugas</option>
              {petugas.map((akun) => (
                <option key={akun.accountId} value={akun.accountId}>{akun.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={pending} className="self-start">{pending ? "Menyimpan…" : "Buat tugas"}</Button>
          <Feedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}

/** The PTSP's answer to a filed order: fixable (Perlu Perbaikan, refiled at no charge) or final (Ditolak, refunded in full). */
export function TolakPtspForm({ nomor, dokumen, bisaFinal }: { nomor: string; dokumen: string[]; bisaFinal: boolean }) {
  const [state, action, pending] = useActionState(tolakPtspAction, idle);
  return (
    <Card>
      <CardHeader>
        <CardTitle>PTSP menolak pengajuan</CardTitle>
        <CardDescription>
          Dapat diperbaiki: dikembalikan ke keluarga untuk unggah ulang dokumen yang dipilih, tanpa Tagihan baru. Final{bisaFinal ? ": ditolak dan seluruh Tagihan dikembalikan, Biaya Pengurusan termasuk." : " hanya untuk Pengurusan IPTM saja."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="nomor" value={nomor} />
          <label className={labelClass}>
            Putusan
            <select name="putusan" defaultValue="perbaikan" className={inputClass}>
              <option value="perbaikan">Dapat diperbaiki (Perlu Perbaikan)</option>
              {bisaFinal ? <option value="final">Ditolak final (pengembalian penuh)</option> : null}
            </select>
          </label>
          <label className={labelClass}>
            Alasan dari PTSP (dibaca keluarga)
            <textarea name="alasan" required maxLength={500} rows={3} className="rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-medium">Dokumen yang harus diunggah ulang (untuk yang dapat diperbaiki)</legend>
            {dokumen.map((nama) => (
              <label key={nama} className="flex items-center gap-2">
                <input type="checkbox" name="dokumen" value={nama} /> {nama}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={pending} className="self-start">{pending ? "Menyimpan…" : "Catat putusan PTSP"}</Button>
          <Feedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}
