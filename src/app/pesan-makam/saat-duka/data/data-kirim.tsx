"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ChevronUp, Mail, MessageCircle, Phone } from "lucide-react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import {
  csWhatsAppLink,
  initialKodeMasukVerifyState,
  type CsContact,
  type KodeMasukRequestState,
  type KodeMasukVerifyState,
} from "@/components/kode-masuk/state";
import { CatatanPembayaran } from "@/components/makam/catatan-pembayaran";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PilihLayanan } from "@/components/layanan/pilih-layanan";
import { itemDariPilihan, subtotalPilihan, type OpsiLayananView, type PilihanPerLayanan } from "@/lib/layanan-pilihan";
import { simpanBerkasTertunda } from "@/components/makam/berkas-tertunda";
import { Progress } from "../progress";
import { Field, Fieldset, Pilihan } from "../form";
import { kirimPesanan, verifikasiKodeMasukDanKirim } from "../actions";
import { initialKirimState, tujuanSetelahKirim, type DraftSaatDuka, type KirimState, type MasalahDraft } from "../draft";
import type { KartuView } from "../tampilan";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";

export interface DataKirimProps {
  /**
   * What the screen opens with. On an ordinary visit the three Almarhum fields are
   * empty; on a rebook they carry the declined order's own values, which the page
   * read from that order rather than from the URL.
   */
  draft: Pick<
    DraftSaatDuka,
    "lokasiId" | "jenisMakamId" | "email" | "pemesanName" | "phoneNumber" | "almarhumName" | "tanggalWafat" | "rencanaPemakamanAt"
  >;
  /** The card this screen is about, with the total its order would carry. */
  kartu: KartuView;
  lokasi: { id: string; name: string; city: string };
  /** A signed-in Pemesan skips the Kode Masuk at Kirim. */
  sudahMasuk: boolean;
  /** Sends the Kode Masuk to the typed email (the Masuk action, reused as the spec says). */
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
  /**
   * The Lokasi Mitra's own Saat Duka payment window in hours, read by the page
   * from `lokasi.saatDukaPaymentWindowHours`: what this screen's promise of a
   * deadline is made of. Null when the Lokasi's policy cannot be read, and the
   * copy then says so instead of naming a span.
   */
  jumlahJamPembayaran: number | null;
  /**
   * The Layanan "bisa hari-H" this Lokasi Mitra offers for the burial day (story 23, ticket 53), shown as the opt-in Layanan
   * Tambahan; empty when it offers none or its burial is already a complete package (dri, 2026-11-02).
   */
  layananHariH?: OpsiLayananView[];
  /** The documents this Lokasi Mitra asks for (its own checklist), attached here before Kirim (rapat Ira, 6 Nov 2026). */
  dokumen?: string[];
}

/** The document types and size the family upload accepts (Pemesanan's own: photos or a PDF, 10 MB). */
const JENIS_BERKAS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAKS_BERKAS = 10 * 1024 * 1024;

/**
 * "Data & kirim": the family, the Almarhum, the documents the Lokasi Mitra asks
 * for (attached before Kirim; the Pemesan is the order's Pemegang Hak), the note that nothing is paid now, and
 * the Kode Masuk that opens inline under the form when there is no session yet.
 * The draft lives here, so the Kode Masuk step can place the order with it.
 */
export function DataKirim({ draft, kartu, lokasi, sudahMasuk, mintaKodeMasuk, csContact, jumlahJamPembayaran, layananHariH = [], dokumen = [] }: DataKirimProps) {
  const router = useRouter();
  // The rebook's data is already in `draft` (the page filled it from the declined
  // order), so the family types nothing twice: only the wish and the holder are
  // theirs to decide afresh.
  const [isi, setisi] = useState<IsiAwal>({ ...draft, keinginanPenempatan: "", jenisKelaminAlmarhum: "", alamatRumahDuka: "" });
  // Layanan Tambahan are opt-in (dri, 2026-11-02): nothing is chosen, or sent, until the family opens them.
  const [tambahLayanan, setTambahLayanan] = useState(false);
  // Pemegang Hak is no longer asked (rapat Ira, 6 Nov 2026: the certificate is in the Almarhum's name; "Pemesan" is enough).
  const pemegangHak: DraftSaatDuka["pemegangHak"] = { mode: "pemesan" };
  const [berkas, setBerkas] = useState<Record<string, File>>({});
  const [dokumenSalah, setDokumenSalah] = useState<Record<string, string>>({});
  const [pilihanLayanan, setPilihanLayanan] = useState<PilihanPerLayanan>({});
  const [hasil, setHasil] = useState<KirimState>(initialKirimState);
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const [mengirim, kirim] = useTransition();

  /** One document chosen or cleared: checked for type and size here, then kept for the order page to upload. */
  const pilihBerkas = (nama: string, file: File | null) => {
    const berikut = { ...berkas };
    const salahBaru = { ...dokumenSalah };
    delete salahBaru[nama];
    if (file && !JENIS_BERKAS.includes(file.type)) salahBaru[nama] = "Pilih foto (JPG, PNG, WEBP) atau PDF.";
    else if (file && file.size > MAKS_BERKAS) salahBaru[nama] = "Berkas lebih dari 10 MB. Pilih yang lebih kecil.";
    if (file && !salahBaru[nama]) berikut[nama] = file;
    else delete berikut[nama];
    setBerkas(berikut);
    setDokumenSalah(salahBaru);
    simpanBerkasTertunda(lokasi.id, Object.entries(berikut).map(([namaBerkas, isiBerkas]) => ({ nama: namaBerkas, file: isiBerkas })));
  };
  /** Every document the Lokasi Mitra asks for is attached before Kirim; otherwise each missing one says so. */
  const dokumenLengkap = (): boolean => {
    const kurang = dokumen.filter((nama) => !berkas[nama]);
    if (kurang.length === 0) return true;
    setDokumenSalah({ ...dokumenSalah, ...Object.fromEntries(kurang.map((nama) => [nama, dokumenSalah[nama] ?? "Lampirkan dokumen ini."])) });
    document.getElementById(`dokumen-${dokumen.indexOf(kurang[0])}`)?.focus();
    return false;
  };

  const kirimPesananSekarang = () =>
    dokumenLengkap() &&
    kirim(async () => {
      const hasilKirim = await kirimPesanan(draftLengkap(isi, pemegangHak, (tambahLayanan ? itemDariPilihan(layananHariH, pilihanLayanan, "hari_h") : [])));
      setHasil(hasilKirim);
      // A signed-in Pemesan has no Kode Masuk step to carry the redirect, so the screen carries it.
      const tujuan = tujuanSetelahKirim(hasilKirim);
      if (tujuan) router.push(tujuan);
    });
  const kodeMasukTerbuka = hasil.status === "perlu_kode_masuk";
  const sudahDikirim = hasil.status === "selesai";
  /** What each field has to fix, from the draft the Server Action refused (docs/design-system.md). */
  const salah: MasalahDraft = hasil.status === "gagal" ? (hasil.pesan ?? {}) : {};

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <Progress
        langkah={2}
        total={2}
        onBack={() => router.push(`/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(lokasi.id)}`)}
        backLabel="Pilih makam"
      />
      <div className="mt-6 flex flex-col gap-6">
        <div className="rounded-3xl border border-border bg-brand-soft px-6 py-8 md:px-10 md:py-12">
          <p className="flex items-center gap-3 text-small font-bold tracking-widest text-forest uppercase">
            <span className="h-px w-6 bg-forest" aria-hidden /> Langkah 2 dari 2
          </p>
          <h1 className="mt-3 font-heading text-4xl font-extrabold leading-tight tracking-tight text-foreground md:text-6xl">Data &amp; kirim</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Cukup yang kami perlukan untuk menyiapkan pemakaman. Sisanya bisa menyusul.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            {/* The tipe's detail and its total are read here, not on Pilih makam (dri, 6 Nov 2026). */}
            <div className="min-w-0" data-testid="detail-tipe">
              <p className="text-lg">
                <span className="font-bold text-forest">{kartu.jenisMakamName}</span> · {lokasi.name}
              </p>
              {kartu.deskripsi ? <p className="text-body-lg text-muted-foreground">{kartu.deskripsi}</p> : null}
              <p className="text-body-lg text-muted-foreground">{kartu.masaHakPakai}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold tabular-nums text-foreground">
                {formatRupiah(kartu.total)} <span className="text-body font-normal text-muted-foreground">semua biaya</span>
              </p>
            </div>
            <Link
              href={`/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(lokasi.id)}`}
              className="inline-flex h-12 shrink-0 items-center rounded-full border-2 border-forest/25 px-5 text-lg font-bold text-forest hover:border-forest"
            >
              Ganti
            </Link>
          </div>
        </div>

        {/*
          Every Input below carries both `text-body-lg` and `md:text-body-lg`:
          the shared Input component's own default is `text-base md:text-sm`,
          and `md:text-sm` only loses to a later unprefixed class below the
          `md` breakpoint — at 768px and up it still wins over a bare
          `text-body-lg`, so the `md:` copy is what actually keeps these at
          the prototype's larger size on desktop too. Checked by measuring
          getComputedStyle at 1440px: 14px without it, 16px with it.
        */}
        <Fieldset legend="Data Pemesan">
          <Field id="pemesan-nama" label="Nama lengkap" error={salah.pemesanName}>
            <Input
              id="pemesan-nama"
              value={isi.pemesanName}
              onChange={(event) => setisi({ ...isi, pemesanName: event.target.value })}
              autoComplete="name"
              placeholder="Nama sesuai KTP"
              aria-invalid={salah.pemesanName ? true : undefined}
              className="h-12 text-body-lg md:text-body-lg"
            />
          </Field>
          <Field
            id="pemesan-email"
            label="Email"
            error={salah.email}
            hint={
              // What Notifications really sends a family: the order's own news
              // (placed, then confirmed), the Tagihan and its documents.
              sudahMasuk
                ? "Email akun Anda, sudah terverifikasi. Kabar pesanan, Tagihan dan dokumen pesanan Anda dikirim ke email ini."
                : "Kode Masuk dikirim ke email ini saat Anda menekan Kirim. Kabar pesanan, Tagihan dan dokumen pesanan Anda juga dikirim ke sini."
            }
          >
            <Input
              id="pemesan-email"
              type="email"
              required
              value={isi.email}
              onChange={(event) => setisi({ ...isi, email: event.target.value })}
              autoComplete="email"
              placeholder="nama@contoh.id"
              aria-invalid={salah.email ? true : undefined}
              // A signed-in Pemesan's address is already proven: it is the account's
              // Email Terverifikasi, so the field only says which one it is.
              readOnly={sudahMasuk}
              className={cn("h-12 text-body-lg md:text-body-lg", sudahMasuk && "bg-muted text-muted-foreground")}
            />
          </Field>
          <Field id="pemesan-telepon" label="Nomor telepon" hint="Agar Lokasi Mitra dan tim kami bisa menelepon bila perlu." error={salah.phoneNumber}>
            <Input
              id="pemesan-telepon"
              type="tel"
              required
              value={isi.phoneNumber}
              onChange={(event) => setisi({ ...isi, phoneNumber: event.target.value })}
              autoComplete="tel"
              inputMode="tel"
              placeholder="08xx-xxxx-xxxx"
              aria-invalid={salah.phoneNumber ? true : undefined}
              className="h-12 text-body-lg md:text-body-lg"
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Data Mendiang">
          <Field id="almarhum" label="Nama mendiang" error={salah.almarhumName}>
            <Input
              id="almarhum"
              required
              value={isi.almarhumName}
              onChange={(event) => setisi({ ...isi, almarhumName: event.target.value })}
              aria-invalid={salah.almarhumName ? true : undefined}
              className="h-12 text-body-lg md:text-body-lg"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-body font-semibold">Jenis kelamin</span>
            <Pilihan
              label="Jenis kelamin mendiang"
              value={isi.jenisKelaminAlmarhum}
              onChange={(nilai) => setisi({ ...isi, jenisKelaminAlmarhum: nilai as Isi["jenisKelaminAlmarhum"] })}
              options={[
                ["laki_laki", "Laki-laki"],
                ["perempuan", "Perempuan"],
              ]}
            />
            {salah.jenisKelaminAlmarhum ? (
              <p className="text-small text-destructive" role="alert">
                {salah.jenisKelaminAlmarhum}
              </p>
            ) : null}
          </div>
          <Field
            id="rumah-duka"
            label="Alamat rumah duka"
            optional
            error={salah.alamatRumahDuka}
            hint="Tempat jenazah disemayamkan sekarang: rumah duka, rumah sakit, atau rumah keluarga."
          >
            <textarea
              id="rumah-duka"
              rows={2}
              maxLength={500}
              value={isi.alamatRumahDuka}
              onChange={(event) => setisi({ ...isi, alamatRumahDuka: event.target.value })}
              aria-invalid={salah.alamatRumahDuka ? true : undefined}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-body-lg outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </Field>
          <Field id="wafat" label="Tanggal wafat" error={salah.tanggalWafat}>
            <Input
              id="wafat"
              type="date"
              required
              value={isi.tanggalWafat}
              onChange={(event) => setisi({ ...isi, tanggalWafat: event.target.value })}
              aria-invalid={salah.tanggalWafat ? true : undefined}
              className="h-12 text-body-lg md:text-body-lg"
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Rencana pemakaman" note="Boleh dikosongkan; Lokasi Mitra akan menghubungi Anda.">
          <Field id="waktu" label="Waktu pemakaman yang direncanakan" optional error={salah.rencanaPemakamanAt} hint="Waktu Indonesia (WIB).">
            <Input
              id="waktu"
              type="datetime-local"
              value={isi.rencanaPemakamanAt}
              onChange={(event) => setisi({ ...isi, rencanaPemakamanAt: event.target.value })}
              aria-invalid={salah.rencanaPemakamanAt ? true : undefined}
              className="h-12 text-body-lg md:text-body-lg"
            />
          </Field>
          <Field
            id="penempatan"
            label="Keinginan penempatan"
            optional
            hint="Misalnya dekat makam keluarga, bila memungkinkan. Lokasi Mitra yang menentukan petaknya."
          >
            <textarea
              id="penempatan"
              rows={2}
              value={isi.keinginanPenempatan}
              onChange={(event) => setisi({ ...isi, keinginanPenempatan: event.target.value })}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-body-lg outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </Field>
        </Fieldset>

        {dokumen.length > 0 ? (
          <Fieldset
            legend="Dokumen"
            note="Dilampirkan sekarang agar data lengkap saat Lokasi Mitra mengonfirmasi. Foto atau pindai, JPG, PNG, WEBP atau PDF, maksimal 10 MB per berkas."
          >
            {dokumen.map((nama, indeks) => (
              <Field key={nama} id={`dokumen-${indeks}`} label={nama} error={dokumenSalah[nama]}>
                <Input
                  id={`dokumen-${indeks}`}
                  type="file"
                  accept={JENIS_BERKAS.join(",")}
                  required
                  onChange={(event) => pilihBerkas(nama, event.target.files?.[0] ?? null)}
                  aria-invalid={dokumenSalah[nama] ? true : undefined}
                  className="h-12 text-body-lg md:text-body-lg"
                />
              </Field>
            ))}
          </Fieldset>
        ) : null}

        {layananHariH.length > 0 ? (
          <Fieldset
            legend="Layanan Tambahan"
            note="Pilihan, bila diperlukan: dikerjakan pada hari pemakaman dan ditagihkan pada Tagihan yang sama. Harga dipastikan saat Lokasi Mitra mengonfirmasi."
          >
            <label className="flex min-h-12 items-center gap-3 text-body-lg">
              <input
                type="checkbox"
                checked={tambahLayanan}
                onChange={(event) => setTambahLayanan(event.target.checked)}
                className="size-5 accent-primary"
              />
              Saya ingin menambah layanan
            </label>
            {tambahLayanan ? <PilihLayanan idAwalan="hari-h" opsi={layananHariH} nilai={pilihanLayanan} onChange={setPilihanLayanan} /> : null}
          </Fieldset>
        ) : null}

        <CatatanPembayaran jumlahJam={jumlahJamPembayaran} />

        {kodeMasukTerbuka ? (
          <div className="flex flex-col gap-4 rounded-3xl border-4 border-forest bg-card p-6 md:p-8">
            <p className="flex items-center gap-2 font-heading text-2xl font-extrabold text-forest">
              <Mail className="size-6 text-forest" aria-hidden /> Masukkan Kode Masuk
            </p>
            <KodeMasukForm
              requestAction={mintaKodeMasuk}
              verifyAction={verifikasiDengan(draftLengkap(isi, pemegangHak, (tambahLayanan ? itemDariPilihan(layananHariH, pilihanLayanan, "hari_h") : [])))}
              submitLabel="Kirim pesanan"
              defaultEmail={isi.email}
              csContact={csContact}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              disabled={mengirim || sudahDikirim}
              onClick={kirimPesananSekarang}
              className="h-14 rounded-full px-8 text-lg font-bold shadow-md"
            >
              {mengirim ? "Mengirim…" : "Kirim pesanan"} <ArrowRight aria-hidden />
            </Button>
            <p className="text-center text-small text-muted-foreground">
              {sudahMasuk
                ? "Kirim pesanan. Tidak ada yang dibayar sekarang."
                : "Kami mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda."}
            </p>
            {/* A refusal the domain owns has no field of its own, so it is said once, under the button. */}
            {hasil.status === "gagal" && !hasil.pesan ? <PesanGagal message={hasil.message} /> : null}
          </div>
        )}

        {/*
          "Tidak punya email? Minta bantuan CS" (spec, the prototype's Kirim
          step), under the Kirim button from the first render — not only after
          a failed send. KodeMasukForm carries its own copy of this same line
          under its email field once it opens (`kodeMasukTerbuka`), so this one
          steps aside there rather than showing two.
        */}
        {csContact && !kodeMasukTerbuka ? (
          <div className="flex flex-col items-center gap-1 text-center text-body">
            <a
              href={csWhatsAppLink(csContact)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-semibold text-brand"
            >
              <MessageCircle className="size-4" aria-hidden /> Tidak punya email? Minta bantuan CS
            </a>
            <p className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
              <Phone className="size-3.5" aria-hidden /> {csContact.whatsApp} · CS dapat mengirimkan pesanan ini untuk Anda
            </p>
          </div>
        ) : null}
      </div>

      <StickyBar kartu={kartu} layanan={tambahLayanan ? subtotalPilihan(layananHariH, pilihanLayanan) : 0} terbuka={rincianTerbuka} setTerbuka={setRincianTerbuka} />
    </div>
  );
}

/**
 * The sticky "Total semua biaya" bar, and the itemised lines it expands to (the
 * same one "Pilih makam" carries, so the total a family reads here is the total
 * it chose there).
 */
function StickyBar({ kartu, layanan, terbuka, setTerbuka }: { kartu: KartuView; layanan: number; terbuka: boolean; setTerbuka: (buka: boolean) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-sticky">
      <div className="mx-auto max-w-3xl px-4">
        {terbuka ? (
          <dl id="rincian-total" className="flex flex-col gap-2 border-b border-border py-4 text-body tabular-nums">
            {kartu.rincian.map((baris) => (
              <div key={baris.label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{baris.label}</dt>
                <dd className="whitespace-nowrap">{formatRupiah(baris.amount)}</dd>
              </div>
            ))}
            {layanan > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Layanan tambahan</dt>
                <dd className="whitespace-nowrap">{formatRupiah(layanan)}</dd>
              </div>
            ) : null}
            <p className="text-small text-muted-foreground">
              Belum ada yang dibayar sekarang. Tagihan terbit setelah Lokasi Mitra mengonfirmasi.
            </p>
          </dl>
        ) : null}
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => setTerbuka(!terbuka)}
            aria-expanded={terbuka}
            aria-controls="rincian-total"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
          >
            <span className="min-w-0">
              <span className="block text-caption text-muted-foreground">Total semua biaya</span>
              <span className="block font-heading text-2xl font-extrabold tabular-nums text-foreground md:text-3xl" data-testid="total-semua-biaya">
                {formatRupiah(kartu.total + layanan)}
              </span>
            </span>
            <ChevronUp className={cn("size-5 shrink-0 text-primary transition-transform", !terbuka && "rotate-180")} aria-hidden />
            <span className="sr-only">{terbuka ? "Sembunyikan rincian" : "Lihat rincian"}</span>
          </button>
          <span className="shrink-0 text-caption text-muted-foreground">{kartu.masaHakPakai}</span>
        </div>
      </div>
    </div>
  );
}

/** The one message a refusal without a field of its own is said with. */
function PesanGagal({ message }: { message: string }) {
  return (
    <p role="alert" className="text-center text-small text-destructive">
      {message}
    </p>
  );
}

/** The draft the Server Action receives, with the Pemegang Hak the screen chose. */
function draftLengkap(isi: IsiAwal, pemegangHak: DraftSaatDuka["pemegangHak"], layananHariH: DraftSaatDuka["layananHariH"]): DraftSaatDuka {
  // An unpicked sex crosses as it is; the Server Action's schema refuses it under its field.
  return { ...isi, pemegangHak, layananHariH } as DraftSaatDuka;
}

/** The fields "Data & kirim" holds, as the draft starts (the choice always begins at "Saya sendiri"). */
type Isi = Omit<DraftSaatDuka, "pemegangHak" | "layananHariH">;
/** The same, before the family has picked the mendiang's sex: empty until then, and refused by the draft schema if sent so. */
type IsiAwal = Omit<Isi, "jenisKelaminAlmarhum"> & { jenisKelaminAlmarhum: Isi["jenisKelaminAlmarhum"] | "" };

/**
 * The Kode Masuk step's own verify action: a correct code places the order with
 * the draft this screen holds and lands the family on its order page. Its
 * refusals are the Kode Masuk form's own `{ status: "gagal", message }`.
 */
function verifikasiDengan(draft: DraftSaatDuka) {
  return async (state: KodeMasukVerifyState, formData: FormData): Promise<KodeMasukVerifyState> => {
    const hasil = await verifikasiKodeMasukDanKirim(draft, state, formData);
    return hasil.status === "gagal" ? { status: "gagal", message: hasil.message } : initialKodeMasukVerifyState;
  };
}
