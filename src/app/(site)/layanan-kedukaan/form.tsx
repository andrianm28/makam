"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import type { CsContact, KodeMasukRequestState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labelWaktuDihubungi, waktuDihubungiValues, type JenisKedukaan } from "@/domain/kedukaan/skema";
import { ajukanKedukaanSaya, verifikasiKodeMasukDanAjukanKedukaan } from "./actions";
import { draftKosong, type DraftKedukaan, type KirimKedukaanState } from "./draft";

const perjalanan = new Set<JenisKedukaan>(["mobil_jenazah", "cargo_jenazah"]);

/** One Permintaan Kedukaan. Nothing is sent until Kirim; with no session the Kode Masuk opens under the form. */
export function FormKedukaan({
  jenis,
  halaman,
  sudahMasuk,
  emailMasuk,
  mintaKodeMasuk,
  csContact,
}: {
  jenis: JenisKedukaan;
  /** The page the confirmation returns to, with `?nomor=`. */
  halaman: string;
  sudahMasuk: boolean;
  emailMasuk: string;
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
}) {
  const [isi, setIsi] = useState<DraftKedukaan>(() => draftKosong(jenis));
  const [hasil, setHasil] = useState<KirimKedukaanState>({ status: "idle" });
  const [mengirim, kirim] = useTransition();
  const router = useRouter();
  const ubah = (nama: keyof DraftKedukaan) => (event: { target: { value: string } }) => setIsi({ ...isi, [nama]: event.target.value });

  function kirimSekarang() {
    kirim(async () => {
      const jadi = await ajukanKedukaanSaya(isi);
      setHasil(jadi);
      if (jadi.status === "selesai") router.push(`${halaman}?nomor=${encodeURIComponent(jadi.nomor)}`);
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        kirimSekarang();
      }}
    >
      <Medan id="nama" label="Nama Anda">
        <Input id="nama" value={isi.nama} onChange={ubah("nama")} autoComplete="name" className="h-12 text-lg" required />
      </Medan>
      <Medan id="telepon" label="Nomor telepon" hint="Tim kami menelepon ke nomor ini.">
        <Input id="telepon" type="tel" value={isi.telepon} onChange={ubah("telepon")} autoComplete="tel" className="h-12 text-lg" required />
      </Medan>
      <Medan id="kab-kota" label="Kota/kabupaten Anda">
        <Input id="kab-kota" value={isi.kabKota} onChange={ubah("kabKota")} className="h-12 text-lg" required />
      </Medan>

      {perjalanan.has(jenis) ? (
        <>
          <Medan id="asal" label={jenis === "mobil_jenazah" ? "Lokasi penjemputan" : "Kota asal"}>
            <Input id="asal" value={isi.asal} onChange={ubah("asal")} className="h-12 text-lg" required />
          </Medan>
          <Medan id="tujuan" label={jenis === "mobil_jenazah" ? "Tujuan" : "Kota tujuan"}>
            <Input id="tujuan" value={isi.tujuan} onChange={ubah("tujuan")} className="h-12 text-lg" required />
          </Medan>
        </>
      ) : null}
      {jenis === "repatriasi_jenazah" ? (
        <>
          <Medan id="negara-asal" label="Negara asal">
            <Input id="negara-asal" value={isi.negaraAsal} onChange={ubah("negaraAsal")} className="h-12 text-lg" required />
          </Medan>
          <Medan id="tujuan" label="Kota tujuan di Indonesia">
            <Input id="tujuan" value={isi.tujuan} onChange={ubah("tujuan")} className="h-12 text-lg" required />
          </Medan>
        </>
      ) : null}
      {jenis !== "konsultasi" ? (
        <Medan id="tanggal" label={jenis === "repatriasi_jenazah" ? "Perkiraan tanggal" : "Tanggal dibutuhkan"}>
          <Input id="tanggal" type="date" value={isi.tanggal} onChange={ubah("tanggal")} className="h-12 text-lg" required />
        </Medan>
      ) : null}
      {jenis === "bunga_duka_cita" ? (
        <Medan id="teks-ucapan" label="Teks ucapan (opsional)" hint="Paling banyak 200 huruf.">
          <Input id="teks-ucapan" value={isi.teksUcapan} onChange={ubah("teksUcapan")} maxLength={200} className="h-12 text-lg" />
        </Medan>
      ) : null}
      {jenis === "konsultasi" ? (
        <>
          <Medan id="waktu" label="Waktu Anda bisa dihubungi">
            <select id="waktu" value={isi.waktuDihubungi} onChange={ubah("waktuDihubungi")} className={pilihClass}>
              {waktuDihubungiValues.map((waktu) => (
                <option key={waktu} value={waktu}>
                  {labelWaktuDihubungi[waktu]}
                </option>
              ))}
            </select>
          </Medan>
          <Medan id="lokasi" label="Lokasi makam yang diminati (opsional)">
            <Input id="lokasi" value={isi.lokasiDiminati} onChange={ubah("lokasiDiminati")} className="h-12 text-lg" />
          </Medan>
        </>
      ) : null}
      <Medan id="catatan" label="Catatan (opsional)" hint="Apa saja yang perlu kami ketahui sebelum menelepon.">
        <textarea id="catatan" value={isi.catatan} onChange={ubah("catatan")} maxLength={1000} rows={3} className={areaClass} />
      </Medan>

      {hasil.status === "gagal" ? (
        <p role="alert" className="text-lg text-destructive">
          {hasil.message}
        </p>
      ) : null}

      {hasil.status === "perlu_kode_masuk" ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5">
          <h3 className="font-heading text-2xl font-extrabold text-foreground">Masukkan Kode Masuk</h3>
          <KodeMasukForm
            requestAction={mintaKodeMasuk}
            verifyAction={(state, formData) => verifikasiKodeMasukDanAjukanKedukaan(isi, state, formData)}
            submitLabel="Kirim permintaan"
            csContact={csContact}
            defaultEmail={emailMasuk}
          />
        </div>
      ) : (
        <>
          <Button type="submit" size="lg" disabled={mengirim} className="h-14 rounded-full px-8 text-lg font-bold shadow-md">
            {mengirim ? "Mengirim…" : "Kirim permintaan"}
          </Button>
          {!sudahMasuk ? (
            <p className="text-center text-body text-muted-foreground">Kami mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda.</p>
          ) : null}
        </>
      )}
    </form>
  );
}

const pilihClass = "h-11 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const areaClass = "rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Medan({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-lg font-bold">
        {label}
      </label>
      {hint ? <p className="text-body text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}
