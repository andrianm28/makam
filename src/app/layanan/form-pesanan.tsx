"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import type { CsContact, KodeMasukRequestState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";
import { hargaPilihanLayanan, kirimPesananLayanan, verifikasiKodeMasukDanKirimLayanan } from "./actions";
import type { HargaPesananTerbaca, LayananTawarkan, TampilanPesananLayanan } from "./tampilan";

/**
 * The Layanan order's own form (spec, Layanan > Order; story 86): choose a
 * fixed-price variant, fill the text the Layanan asks for, and pick a target date
 * that respects its lead time. One order is one grave with one or more Layanan,
 * and the price under the list is the price of the **chosen set** — recomputed on
 * every change, so the number on the screen is the number on the Tagihan.
 *
 * A Client Component, and it takes the Layanan module's Zod schema from that
 * module's **own** file (`@/domain/layanan/pesanan-schema`), never from its
 * barrel: a bundler keeps a module whole, and the barrel reaches the database.
 */
export function FormPesananLayanan({
  tampilan,
  sudahMasuk,
  mintaKodeMasuk,
  csContact,
}: {
  tampilan: TampilanPesananLayanan;
  sudahMasuk: boolean;
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
}) {
  const router = useRouter();
  const [dipilih, setDipilih] = useState<Record<string, string>>({});
  const [tanggal, setTanggal] = useState<Record<string, string>>({});
  const [teks, setTeks] = useState<Record<string, string>>({});
  const [nama, setNama] = useState(tampilan.pemesan?.nama ?? "");
  const [telepon, setTelepon] = useState(tampilan.pemesan?.telepon ?? "");
  const [email, setEmail] = useState(tampilan.pemesan?.email ?? "");
  const [harga, setHarga] = useState<HargaPesananTerbaca | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  const [perluKode, setPerluKode] = useState(false);
  const [mengirim, mulaiKirim] = useTransition();

  const variantIds = Object.values(dipilih);
  const kunciHarga = variantIds.slice().sort().join(",");

  useEffect(() => {
    let dibatalkan = false;
    void hargaPilihanLayanan({ lokasiId: tampilan.lokasi?.id, layananVariantIds: variantIds }).then((hasil) => {
      // The action answers with the three parts the screen shows; the fourth field of
      // `HargaPesananTerbaca` is the page's own read, not this one.
      if (!dibatalkan) setHarga(hasil === null ? null : { ...hasil, inForceSince: "" });
    });
    return () => {
      dibatalkan = true;
    };
    // The set of chosen variants, in a stable order, is the only thing that changes the price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tampilan.lokasi?.id, kunciHarga]);

  const draft = {
    lokasiId: tampilan.lokasi?.id ?? "",
    petakId: tampilan.petak?.id ?? "",
    pemesanName: nama.trim(),
    phoneNumber: telepon.trim(),
    item: variantIds.flatMap((id) => {
      const grup = tampilan.layanan.find((satu) => satu.varian.some((varian) => varian.id === id));
      if (!grup) return [];
      return [{ layananVariantId: id, targetDate: tanggal[id] ?? grup.targetPalingDini, teks: grup.teksLabel ? teks[id]?.trim() || null : null }];
    }),
  };
  const siap = variantIds.length > 0 && nama.trim() !== "" && telepon.trim() !== "" && email.trim() !== "";

  function kirimSekarang() {
    setGagal(null);
    mulaiKirim(async () => {
      const hasil = await kirimPesananLayanan(draft);
      if (hasil.status === "selesai") router.push(`/layanan/${hasil.nomor}`);
      if (hasil.status === "perlu_kode_masuk") setPerluKode(true);
      if (hasil.status === "gagal") setGagal(hasil.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
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

      {harga ? <RincianHarga harga={harga} /> : null}

      <div className="flex flex-col gap-3">
        <Field id="pemesan-nama" label="Nama lengkap Anda" hint="Nama orang yang memesan, bukan nama Pemegang Hak.">
          <Input id="pemesan-nama" value={nama} onChange={(event) => setNama(event.target.value)} required className="h-11 px-3" />
        </Field>
        <Field id="pemesan-telepon" label="Nomor telepon" hint="Dipakai Tagihan bila ada yang perlu dikonfirmasi.">
          <Input id="pemesan-telepon" type="tel" inputMode="tel" value={telepon} onChange={(event) => setTelepon(event.target.value)} required className="h-11 px-3" />
        </Field>
        <Field id="pemesan-email" label="Email" hint="Wajib. Email ini juga akun Anda lewat Kode Masuk, dan tempat Tagihan serta bukti pekerjaan dikirim.">
          <Input id="pemesan-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="h-11 px-3" />
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
            verifyAction={(kodeState, formData) => verifikasiKodeMasukDanKirimLayanan(draft, kodeState, formData)}
            submitLabel="Pesan layanan"
            defaultEmail={email}
            csContact={csContact}
          />
        </div>
      )}

      <p className="text-small text-muted-foreground">
        Layanan dikerjakan setelah Tagihan dibayar. Boleh batal sampai H-1 atau sampai pekerjaan dimulai; kalau dibatalkan, biaya layanan platform tetap
        kami kenakan.
      </p>
    </div>
  );
}

/** The chosen set's all-in price: the lines, and the total the Tagihan will carry. */
function RincianHarga({ harga }: { harga: HargaPesananTerbaca }) {
  return (
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
      <p className="mt-1 text-small text-muted-foreground">Harga ini yang masuk ke Tagihan, tidak berubah di langkah berikutnya.</p>
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
  layanan: LayananTawarkan;
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
                // The picker refuses every day inside the lead time, so a family cannot choose a date the
                // Lokasi has no time to prepare. The module refuses it again at Kirim.
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
                <textarea
                  id={`teks-${layanan.id}`}
                  rows={3}
                  value={teks}
                  onChange={(event) => onTeks(event.target.value)}
                  required
                  className="rounded-lg border border-input bg-background px-3 py-2"
                />
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-body font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className="text-small text-muted-foreground">{hint}</p>
    </div>
  );
}
