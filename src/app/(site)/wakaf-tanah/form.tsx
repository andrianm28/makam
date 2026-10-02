"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import type { CsContact, KodeMasukRequestState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ajukanWakafSaya, verifikasiKodeMasukDanAjukanWakaf } from "./actions";
import type { DraftWakaf, KirimWakafState } from "./draft";

const kosong: DraftWakaf = {
  tujuan: "sosial",
  namaKeluarga: "",
  wakifNama: "",
  wakifTelepon: "",
  hubunganDenganTanah: "",
  kabKota: "",
  alamat: "",
  lat: "",
  lng: "",
  luasM2: "",
  jenisBukti: "",
  nazhirId: "",
  nazhirNama: "",
};

/** The one-page Pengajuan Wakaf. Nothing is sent until Kirim; with no session the Kode Masuk opens under the form. */
export function FormWakaf({
  nazhir,
  kabKota,
  sudahMasuk,
  emailMasuk,
  mintaKodeMasuk,
  csContact,
}: {
  nazhir: { id: string; nama: string; jenis: string; kabKota: string }[];
  /** The kab/kota inside Jabodetabek; any other can be typed and is Dirujuk. */
  kabKota: string[];
  sudahMasuk: boolean;
  emailMasuk: string;
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
}) {
  const [isi, setIsi] = useState<DraftWakaf>(kosong);
  const [hasil, setHasil] = useState<KirimWakafState>({ status: "idle" });
  const [mengirim, kirim] = useTransition();
  const router = useRouter();
  const ubah = (nama: keyof DraftWakaf) => (event: { target: { value: string } }) => setIsi({ ...isi, [nama]: event.target.value });

  function kirimSekarang() {
    kirim(async () => {
      const jadi = await ajukanWakafSaya(isi);
      setHasil(jadi);
      if (jadi.status === "selesai" || jadi.status === "dirujuk") router.push(`/wakaf-tanah?nomor=${encodeURIComponent(jadi.nomor)}`);
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
      <Medan id="tujuan" label="Tujuan wakaf">
        <select id="tujuan" value={isi.tujuan} onChange={ubah("tujuan")} className={pilihClass}>
          <option value="sosial">Sosial (pemakaman umum)</option>
          <option value="keluarga">Keluarga</option>
        </select>
      </Medan>
      {isi.tujuan === "keluarga" ? (
        <Medan id="nama-keluarga" label="Nama keluarga">
          <Input id="nama-keluarga" value={isi.namaKeluarga} onChange={ubah("namaKeluarga")} className="h-11" required />
        </Medan>
      ) : null}
      <Medan id="wakif-nama" label="Nama Anda (Wakif)">
        <Input id="wakif-nama" value={isi.wakifNama} onChange={ubah("wakifNama")} autoComplete="name" className="h-11" required />
      </Medan>
      <Medan id="wakif-telepon" label="Nomor telepon">
        <Input id="wakif-telepon" type="tel" value={isi.wakifTelepon} onChange={ubah("wakifTelepon")} autoComplete="tel" className="h-11" required />
      </Medan>
      <Medan id="hubungan" label="Hubungan Anda dengan tanah" hint="Misalnya pemilik, ahli waris atau kuasa pemilik.">
        <Input id="hubungan" value={isi.hubunganDenganTanah} onChange={ubah("hubunganDenganTanah")} className="h-11" required />
      </Medan>
      <Medan id="kab-kota" label="Kabupaten/kota tanah" hint="Pilih atau ketik. Di luar Jabodetabek kami hanya bisa memberi petunjuk.">
        <Input id="kab-kota" list="daftar-kab-kota" value={isi.kabKota} onChange={ubah("kabKota")} className="h-11" required />
        <datalist id="daftar-kab-kota">
          {kabKota.map((satu) => (
            <option key={satu} value={satu} />
          ))}
        </datalist>
      </Medan>
      <Medan id="alamat" label="Alamat tanah">
        <Input id="alamat" value={isi.alamat} onChange={ubah("alamat")} className="h-11" required />
      </Medan>
      <div className="grid grid-cols-2 gap-4">
        <Medan id="lat" label="Lintang (opsional)">
          <Input id="lat" inputMode="decimal" value={isi.lat} onChange={ubah("lat")} placeholder="-6.2" className="h-11" />
        </Medan>
        <Medan id="lng" label="Bujur (opsional)">
          <Input id="lng" inputMode="decimal" value={isi.lng} onChange={ubah("lng")} placeholder="106.8" className="h-11" />
        </Medan>
      </div>
      <Medan id="luas" label="Luas tanah (m²)">
        <Input id="luas" inputMode="numeric" value={isi.luasM2} onChange={ubah("luasM2")} className="h-11" required />
      </Medan>
      <Medan id="bukti" label="Bukti kepemilikan" hint="Misalnya SHM, girik atau AJB. Berkasnya boleh Anda unggah nanti di Akun Saya.">
        <Input id="bukti" value={isi.jenisBukti} onChange={ubah("jenisBukti")} className="h-11" required />
      </Medan>
      <Medan id="nazhir" label="Nazhir (opsional)" hint="Pilih dari daftar kami, atau ketik nama Nazhir yang sudah Anda punya.">
        <select id="nazhir" value={isi.nazhirId} onChange={ubah("nazhirId")} className={pilihClass}>
          <option value="">Belum memilih</option>
          {nazhir.map((satu) => (
            <option key={satu.id} value={satu.id}>
              {satu.nama} · {satu.kabKota}
            </option>
          ))}
        </select>
        {isi.nazhirId === "" ? <Input aria-label="Nama Nazhir sendiri" value={isi.nazhirNama} onChange={ubah("nazhirNama")} placeholder="Nama Nazhir Anda" className="mt-2 h-11" /> : null}
      </Medan>

      {hasil.status === "gagal" ? (
        <p role="alert" className="text-body text-destructive">
          {hasil.message}
        </p>
      ) : null}

      {hasil.status === "perlu_kode_masuk" ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5">
          <h3 className="text-title-3 text-foreground">Masukkan Kode Masuk</h3>
          <KodeMasukForm
            requestAction={mintaKodeMasuk}
            verifyAction={(state, formData) => verifikasiKodeMasukDanAjukanWakaf(isi, state, formData)}
            submitLabel="Kirim pengajuan"
            csContact={csContact}
            defaultEmail={emailMasuk}
          />
        </div>
      ) : (
        <>
          <Button type="submit" size="lg" disabled={mengirim}>
            {mengirim ? "Mengirim…" : "Kirim pengajuan"}
          </Button>
          {!sudahMasuk ? (
            <p className="text-center text-small text-muted-foreground">Kami mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda.</p>
          ) : null}
        </>
      )}
    </form>
  );
}

const pilihClass = "h-11 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Medan({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold">
        {label}
      </label>
      {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}
