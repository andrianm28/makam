"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, MessageCircle, Phone, ScrollText } from "lucide-react";
import { KodeMasukForm } from "@/components/kode-masuk/kode-masuk-form";
import { csWhatsAppLink, type KodeMasukRequestState } from "@/components/kode-masuk/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTelepon } from "@/lib/format-telepon";
import { cn } from "@/lib/utils";
import { kirimPesananTerencana, verifikasiKodeMasukDanKirimTerencana } from "./actions";
import type { PilihanPicker } from "./denah-picker";
import { initialKirimState, type DraftTerencana, type KirimState } from "./draft";
import { syaratLines } from "./syarat";
import type { DenahView, SyaratView } from "./tampilan";
import { terencanaPath } from "./tautan";
import { TotalBarTerencana } from "./total-bar";

/**
 * Step 3 of the Terencana wizard, "Data & kirim": who the Hak Pakai is for, who
 * holds it, the contact the Lokasi Mitra may phone, the Syarat Pemesanan
 * Terencana the order is placed under, the note that nothing is paid now, and the
 * Kode Masuk that opens under the form when there is no session yet (the wizard's
 * login is that step, as on the Saat Duka screen). Nothing here is sent until
 * Kirim.
 */
export function DataKirim({
  draft,
  pilihan,
  ringkasan,
  lokasiName,
  denah,
  syarat,
  sudahMasuk,
  mintaKodeMasuk,
  csContact,
}: {
  /** What the picker chose, with the Lokasi Mitra and the contact already known. */
  draft: Pick<DraftTerencana, "lokasiId" | "units" | "email" | "phoneNumber">;
  /** The same choice as the URL carries it, for the "Ganti" link back to the Denah. */
  pilihan: PilihanPicker;
  /** "2 Petak · Blok A: A-01, A-02" as the picker showed it. */
  ringkasan: string;
  lokasiName: string;
  /** The priced selection, for the sticky total bar kept visible while this form is filled in. */
  denah: DenahView;
  syarat: SyaratView;
  /** A signed-in Pemesan skips the Kode Masuk at Kirim. */
  sudahMasuk: boolean;
  /** Sends the Kode Masuk to the typed email (Masuk's own action, as the spec says). */
  mintaKodeMasuk: (state: KodeMasukRequestState, formData: FormData) => Promise<KodeMasukRequestState>;
  csContact: { whatsApp: string; replyHours: string } | null;
}) {
  const [isi, setIsi] = useState({ pemesanName: "", email: draft.email, phoneNumber: draft.phoneNumber });
  const [calon, setCalon] = useState<"saya" | "lain">("saya");
  const [calonNama, setCalonNama] = useState("");
  const [pemegang, setPemegang] = useState<"pemesan" | "lain">("pemesan");
  const [namaHolder, setNamaHolder] = useState("");
  const [teleponHolder, setTeleponHolder] = useState("");
  const [emailHolder, setEmailHolder] = useState("");
  const [hasil, setHasil] = useState<KirimState>(initialKirimState);
  const [mengirim, kirim] = useTransition();
  const router = useRouter();

  const lengkap = (): DraftTerencana => ({
    pemesanName: isi.pemesanName,
    email: isi.email,
    phoneNumber: isi.phoneNumber,
    lokasiId: draft.lokasiId,
    units: draft.units,
    pemegangHak:
      pemegang === "pemesan"
        ? { mode: "pemesan" }
        : { mode: "lain", name: namaHolder, phoneNumber: teleponHolder, email: emailHolder },
    calonPenghuni: calon === "saya" ? { mode: "saya" } : { mode: "lain", name: calonNama },
  });

  /** Kirim for a Pemesan already signed in; the Kode Masuk path places the order inside its own action. */
  function kirimSekarang() {
    kirim(async () => {
      const jadi = await kirimPesananTerencana(lengkap());
      setHasil(jadi);
      if (jadi.status === "selesai") router.push(terencanaPath({ langkah: "terkirim", lokasiId: draft.lokasiId, nomor: jadi.nomor }));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
        <p className="min-w-0 text-body text-brand-soft-foreground">
          <span className="font-semibold">{ringkasan}</span> · {lokasiName}
        </p>
        <Link
          href={terencanaPath({ langkah: "petak", lokasiId: draft.lokasiId, ...pilihan })}
          className="shrink-0 text-body font-semibold text-primary underline underline-offset-2"
        >
          Ganti
        </Link>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <legend className="text-title-3 text-foreground">Data Anda</legend>
        <Field id="pemesan-nama" label="Nama lengkap" hint="Nama Pemegang Hak kalau makam ini untuk Anda sendiri.">
          <Input
            id="pemesan-nama"
            value={isi.pemesanName}
            onChange={(event) => setIsi({ ...isi, pemesanName: event.target.value })}
            autoComplete="name"
            placeholder="Nama sesuai KTP"
            className="h-11"
            required
          />
        </Field>
        <Field
          id="pemesan-email"
          label="Email"
          hint="Kode Masuk dikirim ke email ini saat Anda menekan Kirim, dan semua kabar pesanan juga dikirim ke sini."
        >
          <Input
            id="pemesan-email"
            type="email"
            value={isi.email}
            onChange={(event) => setIsi({ ...isi, email: event.target.value })}
            autoComplete="email"
            placeholder="nama@contoh.id"
            className="h-11"
            required
          />
        </Field>
        <Field id="pemesan-telepon" label="Nomor telepon" hint="Agar Lokasi Mitra dan tim kami bisa menelepon bila perlu.">
          <Input
            id="pemesan-telepon"
            type="tel"
            value={isi.phoneNumber}
            onChange={(event) => setIsi({ ...isi, phoneNumber: event.target.value })}
            autoComplete="tel"
            placeholder="0812 3456 7890"
            className="h-11"
            required
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <legend className="sr-only">Calon Penghuni</legend>
        <div aria-hidden>
          <p className="text-title-3 text-foreground">Calon Penghuni</p>
          <p className="mt-0.5 text-small text-muted-foreground">Untuk siapa makam ini disiapkan. Bisa Anda ubah kapan saja nanti.</p>
        </div>
        <Pilihan
          name="calon"
          value={calon}
          onChange={setCalon}
          options={[
            ["saya", "Untuk saya sendiri"],
            ["lain", "Untuk orang lain"],
          ]}
        />
        {calon === "lain" ? (
          <Field id="calon-nama" label="Nama Calon Penghuni">
            <Input id="calon-nama" value={calonNama} onChange={(event) => setCalonNama(event.target.value)} className="h-11" required />
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <legend className="sr-only">Pemegang Hak</legend>
        <div aria-hidden>
          <p className="text-title-3 text-foreground">Pemegang Hak</p>
          <p className="mt-0.5 text-small text-muted-foreground">
            Orang yang punya hak makam ini, dan yang boleh memperpanjang atau membiayai pemakaman berikutnya.
          </p>
        </div>
        <Pilihan
          name="pemegang"
          value={pemegang}
          onChange={setPemegang}
          options={[
            ["pemesan", "Saya sendiri"],
            ["lain", "Orang lain"],
          ]}
        />
        {pemegang === "lain" ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <Field id="holder-nama" label="Nama Pemegang Hak">
              <Input id="holder-nama" value={namaHolder} onChange={(event) => setNamaHolder(event.target.value)} className="h-11" required />
            </Field>
            <Field id="holder-telepon" label="Nomor telepon Pemegang Hak">
              <Input
                id="holder-telepon"
                type="tel"
                value={teleponHolder}
                onChange={(event) => setTeleponHolder(event.target.value)}
                placeholder="0812 3456 7890"
                className="h-11"
                required
              />
            </Field>
            <Field id="holder-email" label="Email Pemegang Hak" hint="Boleh dikosongkan kalau tidak diketahui.">
              <Input id="holder-email" type="email" value={emailHolder} onChange={(event) => setEmailHolder(event.target.value)} className="h-11" />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <section aria-labelledby="syarat" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="syarat" className="flex items-center gap-2 text-title-3 text-foreground">
          <ScrollText className="size-5 text-primary" aria-hidden /> Syarat Pemesanan Terencana
        </h2>
        <ul className="flex flex-col gap-2 text-body text-foreground">
          {syaratLines(syarat).map((baris) => (
            <li key={baris} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-strong" aria-hidden /> {baris}
            </li>
          ))}
        </ul>
        <p className="text-small text-muted-foreground">
          Syarat ini disimpan bersama pesanan Anda; perubahan kebijakan lokasi kemudian tidak mengubahnya.
        </p>
      </section>

      <div className="rounded-2xl bg-info-soft p-4 text-body text-info-soft-foreground">
        <p className="font-semibold">Belum ada yang dibayar sekarang.</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          <li>Petak yang Anda pilih ditahan untuk Anda sejak pesanan dikirim.</li>
          <li>Lokasi Mitra mengonfirmasi pesanan Anda pada hari kerja berikutnya.</li>
          <li>Setelah dikonfirmasi, Tagihan terbit dan Anda punya 24 jam untuk membayar; kami ingatkan sekitar 4 jam sebelum batasnya.</li>
          <li>Sebelum membayar, Anda bisa membatalkan kapan saja tanpa biaya.</li>
        </ul>
      </div>

      {hasil.status === "gagal" ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-body text-danger-soft-foreground">
          {hasil.message}
        </p>
      ) : null}

      {sudahMasuk ? (
        <Button type="button" size="lg" disabled={mengirim} onClick={kirimSekarang}>
          {mengirim ? "Mengirim…" : (
            <>
              Kirim pesanan <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      ) : hasil.status === "perlu_kode_masuk" ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-card p-5">
          <h2 className="text-title-3 text-foreground">Masukkan Kode Masuk</h2>
          <KodeMasukForm
            requestAction={mintaKodeMasuk}
            verifyAction={(state, formData) => verifikasiKodeMasukDanKirimTerencana(lengkap(), state, formData)}
            submitLabel="Kirim pesanan"
            defaultEmail={isi.email}
            csContact={csContact}
          />
        </div>
      ) : (
        <>
          <Button type="button" size="lg" disabled={mengirim} onClick={kirimSekarang}>
            {mengirim ? "Mengirim…" : (
              <>
                Kirim pesanan <ArrowRight aria-hidden />
              </>
            )}
          </Button>
          <p className="text-center text-small text-muted-foreground">
            Kami akan mengirim Kode Masuk ke email Anda untuk memastikan email itu milik Anda.
          </p>
        </>
      )}

      {/* KodeMasukForm carries its own "Tidak punya email?" line under the email field, so this one only
          shows outside that step (a signed-in Pemesan, or before the Kode Masuk step opens). */}
      {csContact && hasil.status !== "perlu_kode_masuk" ? (
        <div className="flex flex-col items-center gap-1 text-center text-body">
          <a href={csWhatsAppLink(csContact)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-primary">
            <MessageCircle className="size-4" aria-hidden /> Tidak punya email? Minta bantuan CS
          </a>
          <p className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
            <Phone className="size-3.5" aria-hidden /> {formatTelepon(csContact.whatsApp)} · CS dapat mengirimkan pesanan ini untuk Anda
          </p>
        </div>
      ) : null}

      <TotalBarTerencana denah={denah} ringkasanText={ringkasan} ada />
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Looks like the prototype's button-style radios, but is native `<input
 * type="radio">` under a styled `<label>`: one Tab stop for the whole group,
 * arrow keys move the native selection between options, and a screen reader
 * announces "radio button, N of M" on its own — none of which a `role="radio"`
 * `<button>` gets for free.
 */
function Pilihan<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(([nilai, label]) => (
        <label
          key={nilai}
          className={cn(
            "flex h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 text-body-lg has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
            nilai === value ? "border-primary bg-brand-soft font-medium text-brand-soft-foreground" : "border-input bg-card",
          )}
        >
          <input
            type="radio"
            name={name}
            value={nilai}
            checked={nilai === value}
            onChange={() => onChange(nilai)}
            className="sr-only"
          />
          <span
            className={cn("size-4 shrink-0 rounded-full border-2", nilai === value ? "border-primary bg-primary ring-2 ring-card ring-inset" : "border-border-strong")}
            aria-hidden
          />
          {label}
        </label>
      ))}
    </div>
  );
}
