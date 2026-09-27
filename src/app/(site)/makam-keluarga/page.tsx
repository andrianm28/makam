import type { Metadata } from "next";
import Link from "next/link";
import { CsLink } from "@/components/site/cs-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggalPanjang } from "@/lib/format-tanggal";
import {
  BENTUK_CARI,
  HUB_PATH,
  TPU_DAFTAR_PATH,
  TPU_GUIDE_PATH,
  labelBentukCari,
  kartuUntuk,
  type BentukCari,
} from "@/lib/makam-keluarga-content";
import { clientIp } from "@/server/client-ip";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { tampilanHub, type MakamTerbaca, type TampilanHub } from "./hub";

export const metadata: Metadata = {
  title: "Makam Keluarga — Makam.co.id",
  description: "Cari di mana makam keluarga Anda berada, lalu perpanjang, rawat atau urus berkasnya di satu tempat.",
  // The lookup's question travels in the address — a plain GET form, so the answer can be
  // bookmarked and sent to a sibling — and a question about a grave can carry an Almarhum's
  // name. Never indexed; the hub is reached from the menu and from the tiles, never from a search.
  robots: { index: false, follow: true },
};

/**
 * The Makam keluarga hub (spec, Public site and routing decisions): the one page
 * that answers "Di mana makamnya?" and owns the branch for tumpang, Perpanjang,
 * Layanan and Pengurusan IPTM.
 *
 * A plain GET form, so the answer has an address a family can bookmark, send to
 * a sibling or open again later, and so it works without JavaScript. What the
 * page shows is exactly what `tampilanHub` read: the Inventory module's lookup
 * answer and the Lokasi module's public list, nothing else. The four action
 * cards are branches this page owns; each one's flow is built by a later ticket,
 * so a card says so and offers the CS rather than linking to a page that is not
 * there.
 */
export default async function MakamKeluargaPage({ searchParams }: PageProps<"/makam-keluarga">) {
  const actor = await currentActor();
  const hub = await tampilanHub(await searchParams, { ip: await clientIp(), email: actor?.email ?? null });
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Makam Keluarga</h1>
        <p className="text-body-lg text-muted-foreground">
          Satu tempat untuk mencari di mana makam keluarga Anda berada, lalu memperpanjang, merawat atau mengurus berkasnya.
        </p>
      </header>

      {hub.aksiTerpilih ? <PilihanBertahan aksi={kartuUntuk(hub.aksiTerpilih)} /> : null}

      {actor && hub.tabSaya.length > 0 ? <MakamSaya tab={hub.tabSaya} /> : null}

      <section aria-labelledby="cari-heading" className="flex flex-col gap-4">
        <h2 id="cari-heading" className="text-title-2 font-semibold">
          Di mana makamnya?
        </h2>
        <p className="text-body text-muted-foreground">
          Untuk petak di Lokasi Mitra. Kalau makamnya di TPU DKI, panduan pengurusannya ada di bawah.
        </p>
        <FormCari hub={hub} />
      </section>

      {hub.pesan ? <p className="text-body text-muted-foreground">{hub.pesan}</p> : null}

      {hub.ditemukan.map((satu) => (
        <MakamDitemukan key={`${satu.lokasiId}-${satu.kavlingId ?? satu.petak[0]?.petakId}`} satu={satu} aksiTerpilih={hub.aksiTerpilih} contact={contact} />
      ))}

      <section aria-labelledby="tpu-heading" className="flex flex-col gap-3 border-t border-border pt-8">
        <h2 id="tpu-heading" className="text-title-2 font-semibold">
          Kalau makamnya di TPU DKI
        </h2>
        <p className="text-body text-muted-foreground">
          Di TPU, petak dan izin penggunaan tanahnya diurus bersama pemerintah daerah, bukan dengan Hak Pakai seperti di Lokasi Mitra.
        </p>
        <ul className="flex flex-wrap gap-4">
          <li>
            <Link href={TPU_GUIDE_PATH} className="font-medium text-brand underline underline-offset-4">
              Panduan Pengurusan di TPU DKI
            </Link>
          </li>
          <li>
            <Link href={TPU_DAFTAR_PATH} className="font-medium text-brand underline underline-offset-4">
              Daftar TPU DKI
            </Link>
          </li>
        </ul>
        <CsLink contact={contact} className="text-body" label="Tanya CS soal makam di TPU" />
      </section>

      <section aria-labelledby="aksi-heading" className="flex flex-col gap-3 border-t border-border pt-8">
        <h2 id="aksi-heading" className="text-title-2 font-semibold">
          Setelah tahu di mana makamnya
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {hub.kartuAksi.map((kartu) => (
            <li key={kartu.aksi}>
              <KartuAksi kartu={kartu} dipilih={kartu.aksi === hub.aksiTerpilih} contact={contact} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/** The three ways a family can name a grave, plus the Lokasi Mitra to look in. A plain GET form: the answer is an address. */
function FormCari({ hub }: { hub: TampilanHub }) {
  // A first visit has no `cari` in its address, so the form opens on Nomor Makam — and
  // the choice it shows is the one whose field is live.
  const aktif: BentukCari = hub.form.cari ?? "nomor_makam";
  return (
    <form method="get" action={HUB_PATH} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      {hub.aksiTerpilih ? <input type="hidden" name="aksi" value={hub.aksiTerpilih} /> : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Lokasi Mitra
        <select name="lokasi" defaultValue={hub.form.lokasiId} className="h-10 rounded-lg border border-input bg-background px-3">
          <option value="">Pilih Lokasi Mitra</option>
          {hub.pilihanLokasi.map((satu) => (
            <option key={satu.id} value={satu.id}>
              {satu.name} — {satu.city}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1 text-sm font-medium">
        <legend>Yang ingin dicari</legend>
        <div className="flex flex-wrap gap-3 pt-1">
          {BENTUK_CARI.map((bentuk) => (
            <label key={bentuk} className="flex items-center gap-1.5 font-normal">
              <input type="radio" name="cari" value={bentuk} defaultChecked={aktif === bentuk} />
              {labelBentukCari[bentuk]}
            </label>
          ))}
        </div>
      </fieldset>
      {(["nomor_makam", "nomor_kavling"] as BentukCari[]).map((bentuk) => (
        <label key={bentuk} className="flex flex-col gap-1 text-sm font-medium">
          {labelBentukCari[bentuk]}
          <input
            type="text"
            name="nomor"
            defaultValue={aktif === bentuk ? hub.form.nomor : ""}
            // Only the chosen form's field is live, so the address a family gets back carries
            // one question and one answer.
            className="h-10 rounded-lg border border-input bg-background px-3"
            {...(aktif === bentuk ? {} : { disabled: true })}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama Almarhum
        <input
          type="text"
          name="nama"
          defaultValue={aktif === "nama" ? hub.form.nama : ""}
          className="h-10 rounded-lg border border-input bg-background px-3"
          {...(aktif === "nama" ? {} : { disabled: true })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tahun wafat
        <input
          type="text"
          inputMode="numeric"
          name="tahun"
          defaultValue={aktif === "nama" ? hub.form.tahun : ""}
          placeholder="mis. 2022"
          className="h-10 rounded-lg border border-input bg-background px-3"
          {...(aktif === "nama" ? {} : { disabled: true })}
        />
      </label>
      <button type="submit" className="h-10 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
        Cari makam
      </button>
      <p className="text-small text-muted-foreground">
        Tidak menemukan Lokasi Mitra Anda di daftar? Tanya CS, kami bantu mencarikan makamnya.
      </p>
    </form>
  );
}

/** One grave as a family is told: where it is, who lies in it, and what state the Hak Pakai is in. */
function MakamDitemukan({ satu, aksiTerpilih, contact }: { satu: MakamTerbaca; aksiTerpilih: TampilanHub["aksiTerpilih"]; contact: Parameters<typeof CsLink>[0]["contact"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{satu.namaLokasi}</CardTitle>
        <CardDescription>
          {satu.nomorKavling ? `Kavling Keluarga ${satu.nomorKavling}` : "Petak Makam"} ·{" "}
          {satu.petak.map((petak) => petak.nomorMakam).join(", ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {satu.petak.map((petak) => (
          <div key={petak.petakId} className="flex flex-col gap-1">
            <p className="text-body font-medium">
              {petak.almarhum.length > 0 ? petak.almarhum.join(", ") : "Belum ada nama Almarhum yang tercatat"}
            </p>
            <p className="text-body text-muted-foreground">
              Hak Pakai {petak.status.label.toLowerCase()} — {petak.status.arti}
            </p>
            <p className="text-body text-muted-foreground">
              {petak.tanggalBerakhir === null
                ? "Tanggal berakhirnya Hak Pakai belum tercatat; tanyakan ke Admin Lokasi di lokasi ini."
                : `Berlaku sampai ${formatTanggalPanjang(petak.tanggalBerakhir)}`}
            </p>
          </div>
        ))}
        <p className="text-small text-muted-foreground">
          Data ini hanya berisi nama Almarhum, nomor makam, status Hak Pakai dan tanggal berakhirnya. Nama dan kontak Pemegang Hak
          tidak ditampilkan di sini.
        </p>
        <CsLink contact={contact} className="text-body" label="Tanya CS soal makam ini" />
        {aksiTerpilih === null ? (
          <p className="text-small text-muted-foreground">Pilih salah satu langkah di bawah untuk melanjutkan dari makam ini.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The branch a tile preselected, said once at the top so the family knows why it is first. */
function PilihanBertahan({ aksi }: { aksi: TampilanHub["kartuAksi"][number] }) {
  return (
    <p className="rounded-lg bg-info-soft p-3 text-body text-info-soft-foreground">
      Anda membuka <span className="font-semibold">{aksi.label}</span>. Cari makam dulu, lalu lanjutkan ke langkah ini.
    </p>
  );
}

/** One branch. Its flow is a later ticket's, so an unbuilt one says so and offers the CS. */
function KartuAksi({ kartu, dipilih, contact }: { kartu: TampilanHub["kartuAksi"][number]; dipilih: boolean; contact: Parameters<typeof CsLink>[0]["contact"] }) {
  return (
    <Card className={dipilih ? "h-full border-brand" : "h-full"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {kartu.label}
          {dipilih ? <span className="text-caption font-medium text-brand">Pilihan Anda</span> : null}
        </CardTitle>
        <CardDescription>{kartu.ringkas}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2">
        {kartu.href ? (
          <Link href={kartu.href} className="font-medium text-brand underline underline-offset-4">
            Mulai {kartu.label.toLowerCase()}
          </Link>
        ) : (
          <>
            <p className="text-body text-muted-foreground">Segera hadir.</p>
            <CsLink contact={contact} className="text-body" label={`Tanya CS soal ${kartu.label}`} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The signed-in Akun's own Makam tab: its graves, each one a shortcut back into the hub. */
function MakamSaya({ tab }: { tab: TampilanHub["tabSaya"] }) {
  return (
    <section aria-labelledby="tab-saya-heading" className="flex flex-col gap-3">
      <h2 id="tab-saya-heading" className="text-title-2 font-semibold">
        Makam keluarga Anda
      </h2>
      <ul className="flex flex-col gap-2">
        {tab.map((satu) => (
          <li key={`${satu.lokasiId}-${satu.nomor}`} className="rounded-lg border border-border bg-card p-3">
            <Link href={satu.alamat} className="font-medium text-brand underline underline-offset-4">
              {satu.namaLokasi} · {satu.nomor}
            </Link>
            <p className="text-small text-muted-foreground">
              {satu.almarhum.length > 0 ? satu.almarhum.join(", ") : "Belum ada nama Almarhum yang tercatat"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
