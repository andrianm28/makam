"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import { initialKodeMasukVerifyState, type CsContact, type KodeMasukRequestState, type KodeMasukVerifyState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Fieldset } from "../../saat-duka/form";
import { initialKirimState, tujuanSetelahKirim, type KirimState, type MasalahDraft } from "../../saat-duka/draft";
import { ajukanTumpangAction, verifikasiKodeMasukDanAjukanTumpang } from "../actions";
import type { DraftTumpang } from "../draft";

export interface DataKirimTumpangProps {
  /** The grave and the kind of request, fixed by the hub: the wizard asks for nothing about the plot. */
  awal: Pick<DraftTumpang, "lokasiId" | "hakPakaiId" | "jenis">;
  namaLokasi: string;
  nomorMakam: string;
  /** For the next plot of a Kavling Keluarga: its member Petak to choose from. */
  anggota: { id: string; nomorMakam: string }[];
  emailAwal: string;
  sudahMasuk: boolean;
  csContact: CsContact | null;
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
}

/**
 * "Data & kirim" of Makamkan di sini (ticket 35): only the Almarhum and the Pemesan. Kirim places the request, and for a
 * visitor with no session the Kode Masuk step opens under the form, as in the other wizards (ticket 22).
 */
export function DataKirimTumpang({ awal, namaLokasi, nomorMakam, anggota, emailAwal, sudahMasuk, mintaKodeMasuk, csContact }: DataKirimTumpangProps) {
  const router = useRouter();
  const [isi, setIsi] = useState({ pemesanName: "", email: emailAwal, phoneNumber: "", almarhumName: "", tanggalWafat: "", rencanaPemakamanAt: "", petakId: anggota[0]?.id ?? "" });
  const [hasil, setHasil] = useState<KirimState>(initialKirimState);
  const [mengirim, kirim] = useTransition();
  const draft = (): DraftTumpang => ({ ...awal, ...isi, petakId: anggota.length > 0 ? isi.petakId : undefined });
  const kodeMasukTerbuka = hasil.status === "perlu_kode_masuk";
  const salah: MasalahDraft = hasil.status === "gagal" ? (hasil.pesan ?? {}) : {};
  const ubah = (nama: keyof typeof isi) => (event: { target: { value: string } }) => setIsi({ ...isi, [nama]: event.target.value });

  const kirimSekarang = () =>
    kirim(async () => {
      const hasilKirim = await ajukanTumpangAction(draft());
      setHasil(hasilKirim);
      const tujuan = tujuanSetelahKirim(hasilKirim);
      if (tujuan) router.push(tujuan);
    });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Makamkan di sini</h1>
          <p className="mt-1 text-body-lg text-muted-foreground">
            {namaLokasi} · {nomorMakam}. Pemegang Hak makam ini diminta persetujuannya; tidak ada yang dibayar sekarang.
          </p>
        </div>
        {anggota.length > 0 ? (
          <Fieldset legend="Petak berikutnya">
            <Field id="petak" label="Petak Makam di Kavling Keluarga ini" error={salah.petakId}>
              <select id="petak" value={isi.petakId} onChange={ubah("petakId")} className="h-12 rounded-md border border-input bg-background px-3 text-body-lg">
                {anggota.map((petak) => (
                  <option key={petak.id} value={petak.id}>
                    {petak.nomorMakam}
                  </option>
                ))}
              </select>
            </Field>
          </Fieldset>
        ) : null}
        <Fieldset legend="Almarhum">
          <Field id="almarhum-nama" label="Nama almarhum / almarhumah" error={salah.almarhumName}>
            <Input id="almarhum-nama" value={isi.almarhumName} onChange={ubah("almarhumName")} className="h-12 text-body-lg md:text-body-lg" />
          </Field>
          <Field id="tanggal-wafat" label="Tanggal wafat" error={salah.tanggalWafat}>
            <Input id="tanggal-wafat" type="date" value={isi.tanggalWafat} onChange={ubah("tanggalWafat")} className="h-12 text-body-lg md:text-body-lg" />
          </Field>
          <Field id="rencana" label="Rencana pemakaman (boleh dikosongkan)" error={salah.rencanaPemakamanAt}>
            <Input id="rencana" type="datetime-local" value={isi.rencanaPemakamanAt} onChange={ubah("rencanaPemakamanAt")} className="h-12 text-body-lg md:text-body-lg" />
          </Field>
        </Fieldset>
        <Fieldset legend="Data Anda">
          <Field id="pemesan-nama" label="Nama lengkap" error={salah.pemesanName}>
            <Input id="pemesan-nama" value={isi.pemesanName} onChange={ubah("pemesanName")} autoComplete="name" className="h-12 text-body-lg md:text-body-lg" />
          </Field>
          <Field id="pemesan-telepon" label="Nomor telepon" error={salah.phoneNumber}>
            <Input id="pemesan-telepon" type="tel" value={isi.phoneNumber} onChange={ubah("phoneNumber")} autoComplete="tel" className="h-12 text-body-lg md:text-body-lg" />
          </Field>
          <Field id="pemesan-email" label="Email" error={salah.email}>
            <Input id="pemesan-email" type="email" value={isi.email} readOnly={sudahMasuk} onChange={ubah("email")} autoComplete="email" className="h-12 text-body-lg md:text-body-lg" />
          </Field>
        </Fieldset>

        {kodeMasukTerbuka ? (
          <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5">
            <p className="flex items-center gap-2 text-title-3 text-foreground">
              <Mail className="size-5 text-primary" aria-hidden /> Masukkan Kode Masuk
            </p>
            <KodeMasukForm requestAction={mintaKodeMasuk} verifyAction={verifikasiDengan(draft())} submitLabel="Kirim permintaan" defaultEmail={isi.email} csContact={csContact} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button type="button" size="lg" disabled={mengirim || hasil.status === "selesai"} onClick={kirimSekarang} className="h-12 px-6 text-body-lg">
              {mengirim ? "Mengirim…" : "Kirim permintaan"} <ArrowRight aria-hidden />
            </Button>
            <p className="text-center text-small text-muted-foreground">
              {sudahMasuk ? "Tidak ada yang dibayar sekarang." : "Kami mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda."}
            </p>
            {hasil.status === "gagal" && !hasil.pesan ? (
              <p role="alert" className="text-center text-small text-destructive">
                {hasil.message}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function verifikasiDengan(draft: DraftTumpang) {
  return async (state: KodeMasukVerifyState, formData: FormData): Promise<KodeMasukVerifyState> => {
    const hasil = await verifikasiKodeMasukDanAjukanTumpang(draft, state, formData);
    return hasil.status === "gagal" ? { status: "gagal", message: hasil.message } : initialKodeMasukVerifyState;
  };
}
