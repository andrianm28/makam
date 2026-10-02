"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import type { CsContact, KodeMasukRequestState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toBase64 } from "@/lib/files/base64";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";
import { FOTO_MAKAM_TPU_MAX_BYTES } from "@/domain/layanan/tpu-skema";
import type { DraftTpu } from "./draft";
import { kirimPesananLayananTpu, verifikasiKodeMasukDanKirimLayananTpu } from "./actions";
import type { LayananTpuTawarkan, TampilanPesananTpu } from "./tampilan";

/**
 * The TPU Layanan order's own form (spec, Layanan > Order; stories 85 and 86): say
 * which grave (TPU, blok and nomor, whose it is, an optional photo and pin), choose a
 * fixed-price variant, fill any text and pick a target date that respects the lead
 * time. One order is one grave with one or more Layanan, and the price under the list is
 * the price of the **chosen set** at the DKI price, with no platform fee, recomputed on
 * every change so the number on the screen is the number on the Tagihan.
 *
 * A Client Component, and it takes the Layanan module's Zod schema from that module's
 * **own** file, never from its barrel (AGENTS.md).
 */
export function FormPesananTpu({
  tampilan,
  sudahMasuk,
  mintaKodeMasuk,
  csContact,
  awal,
}: {
  /** The grave of a Makam TPU the order was started from, to prefill the description (ticket 46). */
  awal?: { tpuId: string; blokNomor: string; almarhumName: string } | null;
  tampilan: TampilanPesananTpu;
  sudahMasuk: boolean;
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
}) {
  const router = useRouter();
  const [tpuId, setTpuId] = useState(awal?.tpuId ?? "");
  const [blokNomor, setBlokNomor] = useState(awal?.blokNomor ?? "");
  const [almarhum, setAlmarhum] = useState(awal?.almarhumName ?? "");
  const [keterangan, setKeterangan] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [foto, setFoto] = useState<{ isi: string; contentType: string; nama: string } | null>(null);
  const [fotoGagal, setFotoGagal] = useState<string | null>(null);
  const [dipilih, setDipilih] = useState<Record<string, string>>({});
  const [tanggal, setTanggal] = useState<Record<string, string>>({});
  const [teks, setTeks] = useState<Record<string, string>>({});
  const [nama, setNama] = useState(tampilan.pemesan?.nama ?? "");
  const [telepon, setTelepon] = useState(tampilan.pemesan?.telepon ?? "");
  const [email, setEmail] = useState(tampilan.pemesan?.email ?? "");
  const [gagal, setGagal] = useState<string | null>(null);
  const [perluKode, setPerluKode] = useState(false);
  const [mengirim, mulaiKirim] = useTransition();

  const variantIds = Object.values(dipilih);
  // The price is the sum of the chosen variants' DKI prices, which the server-rendered page handed down
  // (a TPU Tagihan carries no platform fee); Kirim prices the order again on the server.
  const parts = variantIds.flatMap((id) => {
    const grup = tampilan.layanan.find((satu) => satu.varian.some((varian) => varian.id === id));
    const varian = grup?.varian.find((satu) => satu.id === id);
    return grup && varian ? [{ label: `${grup.name} (${varian.name})`, amount: varian.harga }] : [];
  });
  const harga = parts.length > 0 ? { total: parts.reduce((jumlah, baris) => jumlah + baris.amount, 0), parts } : null;

  async function pilihFoto(file: File | undefined) {
    setFotoGagal(null);
    if (!file) return setFoto(null);
    if (file.size > FOTO_MAKAM_TPU_MAX_BYTES) {
      setFoto(null);
      return setFotoGagal("Foto terlalu besar. Ambil ulang foto yang lebih kecil.");
    }
    setFoto({ isi: toBase64(new Uint8Array(await file.arrayBuffer())), contentType: file.type, nama: file.name });
  }

  function pakaiLokasiSaya() {
    navigator.geolocation?.getCurrentPosition(
      (posisi) => {
        setLat(posisi.coords.latitude.toFixed(6));
        setLng(posisi.coords.longitude.toFixed(6));
      },
      () => setGagal("Lokasi perangkat tidak bisa dibaca. Isi pin secara manual, atau kosongkan saja."),
    );
  }

  const latAngka = lat.trim() === "" ? null : Number(lat);
  const lngAngka = lng.trim() === "" ? null : Number(lng);
  const draft: DraftTpu = {
    tpuDkiId: tpuId,
    makam: {
      blokNomor: blokNomor.trim(),
      almarhumName: almarhum.trim(),
      keterangan: keterangan.trim() || null,
      pin: latAngka !== null && lngAngka !== null && Number.isFinite(latAngka) && Number.isFinite(lngAngka) ? { lat: latAngka, lng: lngAngka } : null,
    },
    pemesanName: nama.trim(),
    phoneNumber: telepon.trim(),
    item: variantIds.flatMap((id) => {
      const grup = tampilan.layanan.find((satu) => satu.varian.some((varian) => varian.id === id));
      if (!grup) return [];
      return [{ layananVariantId: id, targetDate: tanggal[id] ?? grup.targetPalingDini, teks: grup.teksLabel ? teks[id]?.trim() || null : null }];
    }),
    foto: foto ? { isi: foto.isi, contentType: foto.contentType } : null,
  };
  const siap = variantIds.length > 0 && tpuId !== "" && blokNomor.trim() !== "" && almarhum.trim() !== "" && nama.trim() !== "" && telepon.trim() !== "" && email.trim() !== "";

  function kirimSekarang() {
    setGagal(null);
    mulaiKirim(async () => {
      const hasil = await kirimPesananLayananTpu(draft);
      if (hasil.status === "selesai") router.push(`/layanan/${hasil.nomor}`);
      if (hasil.status === "perlu_kode_masuk") setPerluKode(true);
      if (hasil.status === "gagal") setGagal(hasil.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="makam-heading">
        <h2 id="makam-heading" className="text-body font-semibold">
          Makam yang dirawat
        </h2>
        <Field id="tpu" label="TPU">
          <select id="tpu" value={tpuId} onChange={(event) => setTpuId(event.target.value)} className="h-11 rounded-lg border border-input bg-background px-3">
            <option value="">Pilih TPU</option>
            {tampilan.tpu.map((satu) => (
              <option key={satu.id} value={satu.id}>
                {satu.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="blok" label="Blok dan nomor makam" hint="Seperti tertulis di papan TPU, misalnya Blok C-7 No. 21.">
          <Input id="blok" value={blokNomor} onChange={(event) => setBlokNomor(event.target.value)} className="h-11 px-3" />
        </Field>
        <Field id="almarhum" label="Nama almarhum / almarhumah">
          <Input id="almarhum" value={almarhum} onChange={(event) => setAlmarhum(event.target.value)} className="h-11 px-3" />
        </Field>
        <Field id="keterangan" label="Keterangan (boleh dikosongkan)" hint="Ciri yang membantu menemukan makam, misalnya dekat pohon kamboja.">
          <Input id="keterangan" value={keterangan} onChange={(event) => setKeterangan(event.target.value)} className="h-11 px-3" />
        </Field>
        <Field id="foto" label="Foto makam (boleh dikosongkan)" hint="Foto acuan untuk Mitra Jasa. Hanya Mitra Jasa yang mengerjakan yang melihatnya.">
          <input id="foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void pilihFoto(event.target.files?.[0])} className="text-body" />
          {foto ? <p className="text-small text-muted-foreground">{foto.nama}</p> : null}
          {fotoGagal ? (
            <p role="alert" className="text-small text-destructive">
              {fotoGagal}
            </p>
          ) : null}
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium">Pin lokasi (boleh dikosongkan)</p>
          <div className="grid grid-cols-2 gap-3">
            <Input aria-label="Lintang" inputMode="decimal" placeholder="Lintang" value={lat} onChange={(event) => setLat(event.target.value)} className="h-11 px-3" />
            <Input aria-label="Bujur" inputMode="decimal" placeholder="Bujur" value={lng} onChange={(event) => setLng(event.target.value)} className="h-11 px-3" />
          </div>
          <Button type="button" variant="outline" onClick={pakaiLokasiSaya}>
            Pakai lokasi saya sekarang
          </Button>
        </div>
      </section>

      <ul className="flex flex-col gap-4">
        {tampilan.layanan.map((layanan) => (
          <LayananSatu
            key={layanan.id}
            layanan={layanan}
            dipilih={dipilih[layanan.id] ?? ""}
            tanggal={tanggal[layanan.id] ?? ""}
            teks={teks[layanan.id] ?? ""}
            onPilih={(id) => setDipilih((sebelumnya) => ({ ...sebelumnya, [layanan.id]: id }))}
            onTanggal={(nilai) => setTanggal((sebelumnya) => ({ ...sebelumnya, [layanan.id]: nilai }))}
            onTeks={(nilai) => setTeks((sebelumnya) => ({ ...sebelumnya, [layanan.id]: nilai }))}
          />
        ))}
      </ul>

      {harga ? (
        <div className="rounded-lg border border-border bg-card p-4" data-testid="harga-pesanan">
          <h2 className="text-body font-semibold">Rincian harga</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {harga.parts.map((baris) => (
              <li key={`${baris.label}-${baris.amount}`} className="flex items-baseline justify-between gap-4 text-body">
                <span>{baris.label}</span>
                <span className="font-medium">{formatRupiah(baris.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-baseline justify-between gap-4 text-body font-semibold">
            <span>Total</span>
            <span data-testid="harga-total">{formatRupiah(harga.total)}</span>
          </p>
          <p className="mt-1 text-small text-muted-foreground">Harga TPU DKI, tanpa biaya layanan platform. Harga ini yang masuk ke Tagihan.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Field id="pemesan-nama" label="Nama lengkap Anda" hint="Nama orang yang memesan.">
          <Input id="pemesan-nama" value={nama} onChange={(event) => setNama(event.target.value)} className="h-11 px-3" />
        </Field>
        <Field id="pemesan-telepon" label="Nomor telepon" hint="Dipakai Tagihan bila ada yang perlu dikonfirmasi. Tidak dibagikan ke Mitra Jasa.">
          <Input id="pemesan-telepon" type="tel" inputMode="tel" value={telepon} onChange={(event) => setTelepon(event.target.value)} className="h-11 px-3" />
        </Field>
        <Field id="pemesan-email" label="Email" hint="Wajib. Email ini juga akun Anda lewat Kode Masuk, dan tempat Tagihan serta bukti pekerjaan dikirim.">
          <Input id="pemesan-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 px-3" />
        </Field>
      </div>

      {gagal ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-body text-danger-soft-foreground">
          {gagal}
        </p>
      ) : null}

      {sudahMasuk || !perluKode ? (
        <Button type="button" size="lg" disabled={!siap || mengirim} onClick={kirimSekarang}>
          {mengirim ? "Mengirim…" : "Pesan layanan"}
        </Button>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-title-3 text-foreground">Masukkan Kode Masuk</h2>
          <KodeMasukForm
            requestAction={mintaKodeMasuk}
            verifyAction={(kodeState, formData) => verifikasiKodeMasukDanKirimLayananTpu(draft, kodeState, formData)}
            submitLabel="Pesan layanan"
            defaultEmail={email}
            csContact={csContact}
          />
        </div>
      )}

      <p className="text-small text-muted-foreground">
        Layanan dikerjakan Mitra Jasa kami setelah Tagihan dibayar. Anda melihat nama depan dan foto Mitra Jasa begitu ia menerima pekerjaannya.
      </p>
    </div>
  );
}

/** One Layanan of the list: its variants, its lead time, its text field and its proof. */
function LayananSatu({
  layanan,
  dipilih,
  tanggal,
  teks,
  onPilih,
  onTanggal,
  onTeks,
}: {
  layanan: LayananTpuTawarkan;
  dipilih: string;
  tanggal: string;
  teks: string;
  onPilih: (id: string) => void;
  onTanggal: (value: string) => void;
  onTeks: (value: string) => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-semibold">{layanan.name}</h3>
        <p className="text-body text-muted-foreground">{layanan.description}</p>
        <p className="text-small text-muted-foreground">
          Bukti yang kami terima: {layanan.proof}. Lead time {layanan.leadTimeDays} hari, jadi paling cepat {formatTanggal(layanan.targetPalingDini)}.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-body font-medium" htmlFor={`varian-${layanan.id}`}>
          Varian
          <select
            id={`varian-${layanan.id}`}
            value={dipilih}
            onChange={(event) => onPilih(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3"
          >
            <option value="">Tidak dipesan</option>
            {layanan.varian.map((varian) => (
              <option key={varian.id} value={varian.id}>
                {varian.name} — {formatRupiah(varian.harga)}
              </option>
            ))}
          </select>
        </label>

        {dipilih ? (
          <>
            <label className="flex flex-col gap-1 text-body font-medium" htmlFor={`tanggal-${layanan.id}`}>
              Tanggal target
              <input
                id={`tanggal-${layanan.id}`}
                type="date"
                min={layanan.targetPalingDini}
                value={tanggal || layanan.targetPalingDini}
                onChange={(event) => onTanggal(event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3"
              />
            </label>
            <p className="text-small text-muted-foreground">Pekerjaan boleh dikerjakan dua hari sebelum atau dua hari setelah tanggal ini.</p>
            {layanan.teksLabel ? (
              <label className="flex flex-col gap-1 text-body font-medium" htmlFor={`teks-${layanan.id}`}>
                {layanan.teksLabel}
                <textarea id={`teks-${layanan.id}`} rows={3} value={teks} onChange={(event) => onTeks(event.target.value)} className="rounded-lg border border-input bg-background px-3 py-2" />
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-body font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
