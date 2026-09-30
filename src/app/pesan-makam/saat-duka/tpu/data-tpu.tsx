"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowRight, ChevronUp, Mail, TriangleAlert } from "lucide-react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import {
  initialKodeMasukVerifyState,
  type CsContact,
  type KodeMasukRequestState,
  type KodeMasukVerifyState,
} from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "../progress";
import { Field, Fieldset, Pilihan } from "../form";
import { kirimPengurusanTpu, verifikasiKodeMasukDanKirimTpu } from "../actions";
import {
  initialKirimState,
  pengurusanPath,
  type DraftTpu,
  type KirimState,
  type MasalahDraft,
} from "../draft";
import type { TpuKartuView } from "../tampilan";
import type { Dokumen, JenisPenguburan } from "@/domain/pengurusan";
import { FOTO_IPTM_MAX_BYTES } from "@/domain/pengurusan/skema-pengurusan";
import { megabytesOf, toBase64 } from "@/lib/files/base64";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";

/** The two document sets for one combination of the answers, as the module built them. */
export interface OpsiDokumen {
  jenis: JenisPenguburan;
  wafatDiJakarta: boolean;
  pemakaman: Dokumen[];
  pengajuan: Dokumen[];
}

/** One Layanan a Saat Duka checkout may add for the burial day, with its variants at the DKI price. */
export interface OpsiHariH {
  id: string;
  name: string;
  teksLabel: string | null;
  varian: { id: string; name: string; harga: number }[];
}

export interface DataTpuProps {
  draft: Pick<DraftTpu, "tpuId" | "email" | "pemesanName" | "phoneNumber"> & Partial<Pick<DraftTpu, "almarhumName" | "tanggalWafat">>;
  /** The Layanan "bisa hari-H" a TPU offers, so a family can add them to the burial (story 23). */
  hariH: OpsiHariH[];
  /** The TPU the list offered, with the price its order would carry. */
  tpu: TpuKartuView;
  /** Every document set the answers can produce, so the checklist never differs from the order's. */
  opsiDokumen: OpsiDokumen[];
  /** A signed-in Pemesan skips the Kode Masuk at Kirim. */
  sudahMasuk: boolean;
  /** Sends the Kode Masuk to the typed email (the Masuk action, reused as the spec says). */
  mintaKodeMasuk: (
    state: KodeMasukRequestState,
    formData: FormData,
  ) => Promise<KodeMasukRequestState>;
  csContact: CsContact | null;
}

/** The answers that change the checklist: how the grave is made, and whether the death was in Jakarta. */
type Jawaban = { jenis: JenisPenguburan; wafatDiJakarta: boolean };

/**
 * "Data & kirim" for a Saat Duka TPU (spec, stories 68–72): how the grave is
 * made (Baru or Tumpang, with the grave described and its IPTM photographed for
 * a Tumpang), the two eligibility questions, the Pemegang Hak for the IPTM, the
 * two document checklists as they change with the answers, and the Kode Masuk
 * that opens inline under the form when there is no session yet.
 */
export function DataTpu({
  draft,
  tpu,
  hariH,
  opsiDokumen,
  sudahMasuk,
  mintaKodeMasuk,
  csContact,
}: DataTpuProps) {
  const router = useRouter();
  const [isi, setisi] = useState({
    ...draft,
    almarhumName: draft.almarhumName ?? "",
    tanggalWafat: draft.tanggalWafat ?? "",
  });
  const [jawaban, setjawaban] = useState<Jawaban>({
    jenis: "baru",
    wafatDiJakarta: true,
  });
  const [kuburan, setkuburan] = useState<{ blokNomor: string; nama: string }>({
    blokNomor: "",
    nama: "",
  });
  const [pemegangHak, setPemegangHak] = useState<DraftTpu["pemegangHak"]>({
    mode: "pemesan",
  });
  /** "KTP DKI?", held apart from where the death happened: only the two together decide eligibility. */
  const [ktpDkiTidak, setKtpDkiTidak] = useState(false);
  /** The hari-H variants the family ticked, by Layanan, with the text the Layanan asks for. */
  const [hariHDipilih, setHariHDipilih] = useState<Record<string, string>>({});
  const [hariHTeks, setHariHTeks] = useState<Record<string, string>>({});
  const [hasil, setHasil] = useState<KirimState>(initialKirimState);
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const [mengirim, kirim] = useTransition();
  const fotoRef = useRef<HTMLInputElement>(null);
  /**
   * One Kirim in flight, whatever the button's own `disabled` says: a second tap
   * between the click and React's next render would place a second order, and a
   * family tapping twice is exactly what happens at 23:00.
   */
  const terkirim = useRef(false);

  /** When the Operator will confirm by, said once under the button, as the card promised it. */
  const konfirmasi = tpu.konfirmasi;
  const dokumen =
    opsiDokumen.find(
      (satu) =>
        satu.jenis === jawaban.jenis &&
        satu.wafatDiJakarta === jawaban.wafatDiJakarta,
    ) ?? opsiDokumen[0];
  /** Neither a DKI KTP nor a death in Jakarta cannot be served at a TPU: the screen says so before anything is sent. */
  const tidakLayak = jawaban.wafatDiJakarta === false && ktpDkiTidak;
  const kodeMasukTerbuka = hasil.status === "perlu_kode_masuk";
  const salah: MasalahDraft =
    hasil.status === "gagal" ? (hasil.pesan ?? {}) : {};

  const kirimSekarang = () =>
    kirim(async () => {
      if (terkirim.current) return;
      terkirim.current = true;
      const draftLengkap = await draftDenganFoto();
      if (!draftLengkap) {
        terkirim.current = false;
        return;
      }
      const hasil = await kirimPengurusanTpu(draftLengkap);
      // A signed-in Pemesan's order is placed here, with no Kode Masuk step to carry the redirect, so the screen carries it.
      if (hasil.status === "selesai") {
        router.push(pengurusanPath(hasil.nomor));
        return;
      }
      // A refusal is the family's to fix, so the button comes back; a placed order leaves the screen and stays locked.
      setHasil(hasil);
      terkirim.current = false;
    });

  /** The draft this screen holds, with the IPTM photo read from the file input and carried as base64. */
  async function draftDenganFoto(): Promise<DraftTpu | null> {
    const berkas = fotoRef.current?.files?.[0] ?? null;
    if (berkas && berkas.size > FOTO_IPTM_MAX_BYTES) {
      const pesan = `Foto IPTM paling besar ${megabytesOf(FOTO_IPTM_MAX_BYTES)} MB.`;
      setHasil({ status: "gagal", message: pesan, pesan: { fotoIptm: pesan } });
      return null;
    }
    return {
      ...isi,
      tpuId: draft.tpuId,
      jenis: jawaban.jenis,
      kelayakan: {
        ktpDki: !ktpDkiTidak,
        wafatDiJakarta: jawaban.wafatDiJakarta,
      },
      kuburan: jawaban.jenis === "tumpang" ? kuburan : null,
      fotoIptm: berkas
        ? {
            nama: berkas.name,
            contentType: berkas.type,
            isi: toBase64(new Uint8Array(await berkas.arrayBuffer())),
          }
        : null,
      pemegangHak,
      layananHariH: hariH.flatMap((grup) => {
        const varianId = hariHDipilih[grup.id];
        return varianId ? [{ layananVariantId: varianId, teks: grup.teksLabel ? hariHTeks[grup.id]?.trim() || null : null }] : [];
      }),
    };
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-40">
      <Progress
        langkah={2}
        total={2}
        onBack={() => router.push(`/pesan-makam/saat-duka?jenis=tpu_dki`)}
        backLabel="Pilih makam"
      />
      <div className="mt-6 flex flex-col gap-6">
        <div>
          <h1 className="text-title-1 text-forest md:text-3xl md:leading-tight">Data &amp; kirim</h1>
          <p className="mt-1 text-body-lg text-muted-foreground">
            Kami siapkan pemakamannya bersama TPU, lalu mengurus IPTM-nya. Isi
            yang kami perlukan dulu; sisanya menyusul.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
          <p className="min-w-0 text-body text-brand-soft-foreground">
            <span className="font-semibold">{tpu.tpuName}</span> · {tpu.kota}
          </p>
          <Link
            href="/pesan-makam/saat-duka?jenis=tpu_dki"
            className="shrink-0 text-body font-semibold text-brand underline underline-offset-2"
          >
            Ganti
          </Link>
        </div>

        <Fieldset legend="Data Anda">
          <Field
            id="pemesan-nama"
            label="Nama lengkap"
            error={salah.pemesanName}
          >
            <Input
              id="pemesan-nama"
              value={isi.pemesanName}
              onChange={(event) =>
                setisi({ ...isi, pemesanName: event.target.value })
              }
              autoComplete="name"
              placeholder="Nama sesuai KTP"
              aria-invalid={salah.pemesanName ? true : undefined}
              className="h-11"
            />
          </Field>
          <Field
            id="pemesan-email"
            label="Email"
            error={salah.email}
            hint={
              sudahMasuk
                ? "Email akun Anda, sudah terverifikasi. Tagihan dan dokumen pesanan Anda dikirim ke email ini."
                : "Kode Masuk dikirim ke email ini saat Anda menekan Kirim. Tagihan dan dokumen pesanan Anda juga dikirim ke sini."
            }
          >
            <Input
              id="pemesan-email"
              type="email"
              required
              value={isi.email}
              onChange={(event) =>
                setisi({ ...isi, email: event.target.value })
              }
              autoComplete="email"
              placeholder="nama@contoh.id"
              aria-invalid={salah.email ? true : undefined}
              // A signed-in Pemesan's address is already proven: the field only says which one it is.
              readOnly={sudahMasuk}
              className={cn(
                "h-11",
                sudahMasuk && "bg-muted text-muted-foreground",
              )}
            />
          </Field>
          <Field
            id="pemesan-telepon"
            label="Nomor telepon"
            hint="Agar tim kami bisa menelepon bila perlu."
            error={salah.phoneNumber}
          >
            <Input
              id="pemesan-telepon"
              type="tel"
              required
              value={isi.phoneNumber}
              onChange={(event) =>
                setisi({ ...isi, phoneNumber: event.target.value })
              }
              autoComplete="tel"
              inputMode="tel"
              placeholder="08xx-xxxx-xxxx"
              aria-invalid={salah.phoneNumber ? true : undefined}
              className="h-11"
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Almarhum">
          <Field
            id="almarhum"
            label="Nama almarhum / almarhumah"
            error={salah.almarhumName}
          >
            <Input
              id="almarhum"
              required
              value={isi.almarhumName}
              onChange={(event) =>
                setisi({ ...isi, almarhumName: event.target.value })
              }
              aria-invalid={salah.almarhumName ? true : undefined}
              className="h-11"
            />
          </Field>
          <Field id="wafat" label="Tanggal wafat" error={salah.tanggalWafat}>
            <Input
              id="wafat"
              type="date"
              required
              value={isi.tanggalWafat}
              onChange={(event) =>
                setisi({ ...isi, tanggalWafat: event.target.value })
              }
              aria-invalid={salah.tanggalWafat ? true : undefined}
              className="h-11"
            />
          </Field>
        </Fieldset>

        <Fieldset
          legend="Pemakaman di TPU"
          note="TPU yang menunjuk petaknya. Tumpang berarti dimakamkan di makam yang sudah ada isinya."
        >
          <Pilihan
            label="Jenis pemakaman"
            value={jawaban.jenis}
            onChange={(nilai) =>
              setjawaban({ ...jawaban, jenis: nilai as JenisPenguburan })
            }
            options={[
              ["baru", "Makam baru"],
              ["tumpang", "Tumpang"],
            ]}
          />
          {jawaban.jenis === "tumpang" ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="rounded-lg bg-warning-soft p-3 text-small text-warning-soft-foreground">
                <p className="flex items-start gap-2">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <span>
                    Pemakaman tumpang hanya bisa kalau{" "}
                    <strong className="font-semibold">
                      IPTM makam itu masih berlaku
                    </strong>{" "}
                    dan pemakaman sebelumnya sudah{" "}
                    <strong className="font-semibold">
                      3 tahun atau lebih
                    </strong>{" "}
                    lalu. Kalau izinnya sudah berakhir, izin itu harus
                    diperpanjang lebih dulu.
                  </span>
                </p>
                <p className="mt-1 pl-6">
                  Kalau makam itu{" "}
                  <strong className="font-semibold">
                    bukan makam keluarga sendiri
                  </strong>
                  , pemakaman tumpang perlu{" "}
                  <strong className="font-semibold">
                    persetujuan tertulis Pemegang Hak
                  </strong>{" "}
                  makam yang ditumpang. Kami butuh surat persetujuannya sebagai
                  dokumen.
                </p>
              </div>
              <Field
                id="kuburan-blok"
                label="Blok dan nomor makam"
                error={salah["kuburan.blokNomor"]}
                hint="Sesuai papan nama di TPU."
              >
                <Input
                  id="kuburan-blok"
                  value={kuburan.blokNomor}
                  onChange={(event) =>
                    setkuburan({ ...kuburan, blokNomor: event.target.value })
                  }
                  placeholder="Blok B-12 No. 34"
                  aria-invalid={salah["kuburan.blokNomor"] ? true : undefined}
                  className="h-11"
                />
              </Field>
              <Field
                id="kuburan-nama"
                label="Nama almarhum yang sudah dimakamkan di sana"
                error={salah["kuburan.nama"]}
              >
                <Input
                  id="kuburan-nama"
                  value={kuburan.nama}
                  onChange={(event) =>
                    setkuburan({ ...kuburan, nama: event.target.value })
                  }
                  aria-invalid={salah["kuburan.nama"] ? true : undefined}
                  className="h-11"
                />
              </Field>
              <Field
                id="foto-iptm"
                label="Foto IPTM makam yang ditumpang"
                error={salah.fotoIptm}
                hint={`Wajib untuk Tumpang, supaya izin yang masih berlaku bisa kami periksa. Maksimal ${megabytesOf(FOTO_IPTM_MAX_BYTES)} MB.`}
              >
                <input
                  id="foto-iptm"
                  ref={fotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  aria-invalid={salah.fotoIptm ? true : undefined}
                  className="block w-full text-small file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-body file:font-medium"
                />
              </Field>
            </div>
          ) : null}
        </Fieldset>

        <Fieldset
          legend="Kelayakan"
          note="Pemakaman di TPU DKI punya syarat. Kalau keduanya tidak, Lokasi Mitra tetap bisa melayani."
        >
          <Pilihan
            label="Apakah KTP Anda dari DKI Jakarta?"
            value={ktpDkiTidak ? "tidak" : "ya"}
            onChange={(nilai) => setKtpDkiTidak(nilai === "tidak")}
            options={[
              ["ya", "Ya, KTP saya DKI Jakarta"],
              ["tidak", "Tidak, KTP saya bukan DKI"],
            ]}
          />
          <Pilihan
            label="Apakah almarhum meninggal di Jakarta?"
            value={jawaban.wafatDiJakarta ? "ya" : "tidak"}
            onChange={(nilai) =>
              setjawaban({ ...jawaban, wafatDiJakarta: nilai === "ya" })
            }
            options={[
              ["ya", "Ya, meninggal di Jakarta"],
              ["tidak", "Tidak, meninggal di luar Jakarta"],
            ]}
          />
          {tidakLayak ? (
            <p
              className="rounded-lg bg-warning-soft p-3 text-small text-warning-soft-foreground"
              role="alert"
            >
              Pemakaman di TPU DKI hanya untuk warga dengan KTP DKI atau yang
              meninggal di Jakarta. Lokasi Mitra menerima pemakaman tanpa syarat
              itu.{" "}
              <Link
                href="/pesan-makam/saat-duka"
                className="font-semibold underline underline-offset-2"
              >
                Lihat pilihan Lokasi Mitra
              </Link>
            </p>
          ) : null}
          {!jawaban.wafatDiJakarta ? (
            <p className="text-small text-muted-foreground">
              Karena almarhum meninggal di luar Jakarta, daftar dokumen
              pengajuan bertambah tiga surat yang diterbitkan di tempat asal:
              pemeriksaan jenazah, laporan kematian, dan surat pengantar Dinas
              Kesehatan setempat.
            </p>
          ) : null}
        </Fieldset>

        <Fieldset
          legend="Pemegang Hak"
          note="Nama yang akan tercatat di IPTM dan yang kami hubungi untuk perpanjangan."
        >
          <Pilihan
            label="Pemegang Hak"
            value={pemegangHak.mode}
            onChange={(mode) =>
              setPemegangHak(
                mode === "pemesan"
                  ? { mode: "pemesan" }
                  : { mode: "lain", name: "", phoneNumber: "", email: "" },
              )
            }
            options={[
              ["pemesan", "Saya sendiri"],
              ["lain", "Anggota keluarga lain"],
            ]}
          />
          {pemegangHak.mode === "lain" ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <Field
                id="ph-nama"
                label="Nama Pemegang Hak"
                error={salah["pemegangHak.name"]}
              >
                <Input
                  id="ph-nama"
                  required
                  value={pemegangHak.name}
                  onChange={(event) =>
                    setPemegangHak({ ...pemegangHak, name: event.target.value })
                  }
                  aria-invalid={salah["pemegangHak.name"] ? true : undefined}
                  className="h-11"
                />
              </Field>
              <Field
                id="ph-telepon"
                label="Nomor telepon Pemegang Hak"
                error={salah["pemegangHak.phoneNumber"]}
              >
                <Input
                  id="ph-telepon"
                  type="tel"
                  required
                  value={pemegangHak.phoneNumber}
                  onChange={(event) =>
                    setPemegangHak({
                      ...pemegangHak,
                      phoneNumber: event.target.value,
                    })
                  }
                  inputMode="tel"
                  aria-invalid={
                    salah["pemegangHak.phoneNumber"] ? true : undefined
                  }
                  className="h-11"
                />
              </Field>
              <Field
                id="ph-email"
                label="Email Pemegang Hak"
                optional
                error={salah["pemegangHak.email"]}
                hint="Bila diisi, salinan Tagihan dan Bukti pesanan ini dikirim ke email tersebut, dan makam ini tampil di Akun dengan email itu."
              >
                <Input
                  id="ph-email"
                  type="email"
                  value={pemegangHak.email}
                  onChange={(event) =>
                    setPemegangHak({
                      ...pemegangHak,
                      email: event.target.value,
                    })
                  }
                  aria-invalid={salah["pemegangHak.email"] ? true : undefined}
                  className="h-11"
                />
              </Field>
            </div>
          ) : null}
        </Fieldset>

        {hariH.length > 0 ? (
          <Fieldset
            legend="Layanan hari-H (boleh dikosongkan)"
            note="Dikerjakan Mitra Jasa kami pada hari pemakaman, dengan harga TPU DKI. Ditagihkan pada Tagihan yang sama, jatuh tempo 3×24 jam setelah pemakaman."
          >
            {hariH.map((grup) => (
              <div key={grup.id} className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-body font-medium text-foreground" htmlFor={`hari-h-${grup.id}`}>
                  {grup.name}
                  <select
                    id={`hari-h-${grup.id}`}
                    value={hariHDipilih[grup.id] ?? ""}
                    onChange={(event) => setHariHDipilih({ ...hariHDipilih, [grup.id]: event.target.value })}
                    className="h-11 rounded-lg border border-input bg-background px-3"
                  >
                    <option value="">Tidak dipesan</option>
                    {grup.varian.map((varian) => (
                      <option key={varian.id} value={varian.id}>
                        {varian.name} — {formatRupiah(varian.harga)}
                      </option>
                    ))}
                  </select>
                </label>
                {grup.teksLabel && hariHDipilih[grup.id] ? (
                  <label className="flex flex-col gap-1 text-body font-medium text-foreground" htmlFor={`hari-h-teks-${grup.id}`}>
                    {grup.teksLabel}
                    <Input
                      id={`hari-h-teks-${grup.id}`}
                      value={hariHTeks[grup.id] ?? ""}
                      onChange={(event) => setHariHTeks({ ...hariHTeks, [grup.id]: event.target.value })}
                      className="h-11"
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </Fieldset>
        ) : null}

        <DuaDaftarDokumen view={dokumen} />

        <div className="rounded-2xl bg-info-soft p-4 text-body text-info-soft-foreground">
          <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
          <p className="mt-1">
            Tagihan terbit setelah pemakaman dikonfirmasi, dan jatuh tempo 3×24
            jam setelah pemakaman. Pemakaman tetap berjalan. Dokumen boleh
            diunggah nanti atau dibawa saat hari pemakaman.
          </p>
        </div>

        {kodeMasukTerbuka ? (
          <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5">
            <p className="flex items-center gap-2 text-title-3 text-foreground">
              <Mail className="size-5 text-primary" aria-hidden /> Masukkan Kode
              Masuk
            </p>
            <KodeMasukForm
              requestAction={mintaKodeMasuk}
              verifyAction={verifikasiDenganFoto()}
              submitLabel="Kirim pengurusan"
              defaultEmail={isi.email}
              csContact={csContact}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              disabled={mengirim || tidakLayak}
              onClick={kirimSekarang}
              className="h-12 px-6 text-body-lg"
            >
              {mengirim ? "Mengirim…" : "Kirim pengurusan"}{" "}
              <ArrowRight aria-hidden />
            </Button>
            <p className="text-center text-small text-muted-foreground">
              {sudahMasuk
                ? "Kirim pengurusan. Tidak ada yang dibayar sekarang."
                : "Kami mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda."}
            </p>
            <p className="text-center text-small text-muted-foreground">
              {konfirmasi}.
            </p>
            {/* A refusal the domain owns has no field of its own, so it is said once, under the button. */}
            {hasil.status === "gagal" && !hasil.pesan ? (
              <PesanGagal message={hasil.message} />
            ) : null}
          </div>
        )}
      </div>

      <StickyBar
        kartu={tpu}
        terbuka={rincianTerbuka}
        setTerbuka={setRincianTerbuka}
      />
    </div>
  );

  /**
   * The Kode Masuk step's own verify action: it places the order with the draft
   * this screen holds, photo included, and lands the family on its order page.
   */
  function verifikasiDenganFoto() {
    return async (
      state: KodeMasukVerifyState,
      formData: FormData,
    ): Promise<KodeMasukVerifyState> => {
      const draftLengkap = await draftDenganFoto();
      const hasil = draftLengkap
        ? await verifikasiKodeMasukDanKirimTpu(draftLengkap, state, formData)
        : null;
      return hasil?.status === "gagal"
        ? { status: "gagal", message: hasil.message }
        : initialKodeMasukVerifyState;
    };
  }
}

/** Both document sets, said with the moment each is met at. */
function DuaDaftarDokumen({ view }: { view: OpsiDokumen }) {
  return (
    <Fieldset
      legend="Dokumen"
      note="Dua daftar berbeda: yang dibawa ke TPU, dan yang diunggah ke kami setelah pemakaman."
    >
      <DaftarDokumen judul="Dibawa saat pemakaman" dokumen={view.pemakaman} />
      <DaftarDokumen
        judul="Diupload setelah pemakaman, paling lambat 7 hari"
        dokumen={view.pengajuan}
      />
    </Fieldset>
  );
}

function DaftarDokumen({
  judul,
  dokumen,
}: {
  judul: string;
  dokumen: Dokumen[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-medium text-foreground">{judul}</p>
      <ul className="flex flex-col gap-1.5">
        {dokumen.map((satu) => (
          <li key={satu.nama} className="text-small text-muted-foreground">
            <span className="font-medium text-foreground">{satu.nama}</span>
            {satu.catatan ? ` — ${satu.catatan}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The sticky "Total semua biaya" bar, the same one "Pilih makam" carries, with the TPU price's lines. */
function StickyBar({
  kartu,
  terbuka,
  setTerbuka,
}: {
  kartu: TpuKartuView;
  terbuka: boolean;
  setTerbuka: (buka: boolean) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-sticky">
      <div className="mx-auto max-w-3xl px-4">
        {terbuka ? (
          <dl
            id="rincian-total"
            className="flex flex-col gap-2 border-b border-border py-4 text-body tabular-nums"
          >
            {kartu.rincian.map((baris) => (
              <div key={baris.label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{baris.label}</dt>
                <dd className="whitespace-nowrap">
                  {formatRupiah(baris.amount)}
                </dd>
              </div>
            ))}
            <p className="text-small text-muted-foreground">
              Belum ada yang dibayar sekarang. Tagihan terbit setelah pemakaman
              dikonfirmasi. Di TPU tidak ada Biaya Layanan Platform.
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
              <span className="block text-caption text-muted-foreground">
                Total semua biaya
              </span>
              <span
                className="block text-title-2 tabular-nums text-foreground"
                data-testid="total-semua-biaya"
              >
                {formatRupiah(kartu.total)}
              </span>
            </span>
            <ChevronUp
              className={cn(
                "size-5 shrink-0 text-primary transition-transform",
                !terbuka && "rotate-180",
              )}
              aria-hidden
            />
            <span className="sr-only">
              {terbuka ? "Sembunyikan rincian" : "Lihat rincian"}
            </span>
          </button>
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
