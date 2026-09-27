import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/makam/brand-logo";
import { ConfirmDialog } from "@/components/makam/confirm-dialog";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { PageTabs } from "@/components/makam/page-tabs";
import { LokasiSwitcher } from "@/components/makam/lokasi-switcher";
import { RoleSwitcher } from "@/components/makam/role-switcher";
import { StatCard } from "@/components/makam/stat-card";
import { StatusBadge, statusVocabulary, type StatusKey } from "@/components/makam/status-badge";
import { ThemeToggle } from "@/components/makam/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { designTokensAtRequestTime, type ColorToken } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { staffMenuActor } from "@/server/staff-area";
import { DataTableDemo } from "./data-table-demo";

const AP = "/staf/admin-platform";

const skalaTipografi: { kelas: string; nama: string; keterangan: string }[] = [
  { kelas: "text-display", nama: "Display", keterangan: "Angka pada StatCard" },
  { kelas: "text-title-1", nama: "Title 1", keterangan: "Judul halaman, satu h1 per halaman (PageHeader)" },
  { kelas: "text-title-2", nama: "Title 2", keterangan: "Judul bagian" },
  { kelas: "text-title-3", nama: "Title 3", keterangan: "Judul panel, kartu, dialog" },
  { kelas: "text-body-lg", nama: "Body besar", keterangan: "Input telepon, teks panjang" },
  { kelas: "text-body", nama: "Body", keterangan: "Teks bawaan area staf" },
  { kelas: "text-small", nama: "Small", keterangan: "Keterangan, meta, sel sekunder" },
  { kelas: "text-caption", nama: "Caption", keterangan: "Badge, judul kolom tabel, jam" },
];

/** One colour token as a swatch: its name, hex and oklch, read from `globals.css` at request time. */
function Swatch({ token }: { token: ColorToken }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
      <span
        aria-hidden
        className="size-10 shrink-0 rounded-md border border-border-strong"
        style={{ backgroundColor: `var(--${token.name})` }}
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-small font-medium text-foreground">--{token.name}</span>
        <span className="font-mono text-caption text-muted-foreground">{token.hex}</span>
        <span className="font-mono text-caption text-muted-foreground">{token.oklch}</span>
      </div>
    </div>
  );
}

/**
 * The design system's live catalogue (docs/design-system.md): colour tokens
 * (hex and oklch, re-read from `globals.css` on every request so this page
 * cannot drift from what components use), the type scale, every makam
 * composition built so far and every StatusBadge. Admin Platform only.
 */
export default async function DesainPage() {
  await staffMenuActor("admin_platform");
  const tokens = designTokensAtRequestTime();

  return (
    <div className="flex flex-col gap-(--section-gap)">
      <PageHeader
        title="Katalog Desain"
        description="Token, skala tipografi, komponen makam dan status yang tersedia di sistem desain, dibaca langsung dari sumber tokennya. Lihat docs/design-system.md untuk penjelasan lengkap."
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 text-foreground">Warna</h2>
        <p className="max-w-prose text-small text-muted-foreground">
          Setiap token warna, terang dan gelap, dibaca ulang dari <code className="font-mono">src/app/globals.css</code> setiap
          halaman ini dibuka: nilainya tidak pernah disalin ke halaman ini, jadi katalog ini tidak bisa berbeda dari yang
          sebenarnya dipakai komponen.
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="text-title-3 text-foreground">Terang</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tokens.light.map((token) => (
              <Swatch key={token.name} token={token} />
            ))}
          </div>
        </div>
        <div className="dark flex flex-col gap-2 rounded-xl bg-background p-4">
          <h3 className="text-title-3 text-foreground">Gelap (hanya yang berbeda dari terang; khusus area staf)</h3>
          {tokens.dark.length === 0 ? (
            <p className="text-small text-muted-foreground">Tidak ada token gelap.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tokens.dark.map((token) => (
                <Swatch key={token.name} token={token} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 text-foreground">Skala tipografi</h2>
        <Card>
          <CardContent className="flex flex-col divide-y divide-border">
            {skalaTipografi.map((skala) => (
              <div key={skala.kelas} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className={cn(skala.kelas, "text-foreground")}>Dibantu, Jelas, Aman</p>
                <p className="font-mono text-caption text-muted-foreground">
                  {skala.kelas} · {skala.nama} — {skala.keterangan}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 text-foreground">Status (StatusBadge)</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-3">
            {(Object.keys(statusVocabulary) as StatusKey[]).map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-title-2 text-foreground">Komponen makam</h2>

        <Card>
          <CardHeader>
            <CardTitle>PageHeader</CardTitle>
            <CardDescription>
              Judul (satu h1 per halaman), status, deskripsi dan aksi di atas setiap halaman. Ditampilkan di sini tanpa tag
              h1 sendiri, supaya halaman katalog ini tetap punya satu h1.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border-strong p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-title-1 text-foreground">Contoh halaman</p>
                  <StatusBadge status="terverifikasi" />
                </div>
                <p className="max-w-prose text-body text-muted-foreground">Deskripsi satu baris di bawah judul.</p>
              </div>
              <span className={buttonVariants({ variant: "default" })}>
                <PlusIcon aria-hidden /> Aksi utama
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>StatCard</CardTitle>
            <CardDescription>Satu angka dasbor, labelnya dan fakta yang menentukan perlu ditindak atau tidak.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Lokasi Mitra Terverifikasi" value={12} note="2 Belum Tayang, 1 Ditangguhkan" />
            <StatCard label="Akun Staf aktif" value={8} note="1 Undangan Staf belum diterima" attention="warning" />
            <StatCard label="Tagihan Terlambat" value={3} note="Perlu ditindak hari ini" attention="danger" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>EmptyState</CardTitle>
            <CardDescription>Daftar, tab atau panel kosong; tone=&quot;error&quot; untuk gagal memuat.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <EmptyState icon={PlusIcon} title="Belum ada data" description="Contoh EmptyState biasa." />
            <EmptyState icon={PlusIcon} title="Gagal memuat" description="Contoh EmptyState tone=error." tone="error" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DataTable</CardTitle>
            <CardDescription>Pola List: pencarian, satu filter, aksi baris dan status kosong / tidak ditemukan.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTableDemo />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PageTabs</CardTitle>
            <CardDescription>Pola Detail: setiap tab adalah URL-nya sendiri.</CardDescription>
          </CardHeader>
          <CardContent>
            <PageTabs
              label="Contoh tab"
              items={[
                { href: `${AP}/desain`, label: "Ringkasan" },
                { href: `${AP}/desain#tidak-ada`, label: "Riwayat" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ConfirmDialog</CardTitle>
            <CardDescription>Aksi yang tidak bisa dibatalkan, atau perlu alasan untuk Audit Log.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmDialog
              trigger={<Button variant="destructive">Contoh aksi</Button>}
              title="Contoh ConfirmDialog"
              description="Ini hanya contoh tampilan; tombol ini tidak melakukan apa pun."
              confirmLabel="Konfirmasi"
              variant="destructive"
              formId="katalog-desain-contoh-form"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RoleSwitcher</CardTitle>
            <CardDescription>Berpindah antar peran staf yang dipegang satu Akun; tersembunyi bila hanya satu peran.</CardDescription>
          </CardHeader>
          <CardContent>
            <RoleSwitcher
              current="admin_platform"
              roles={[
                { value: "admin_platform", label: "Admin Platform", href: `${AP}` },
                { value: "admin_lokasi", label: "Admin Lokasi", href: "/staf/admin-lokasi" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LokasiSwitcher</CardTitle>
            <CardDescription>
              Header Admin Lokasi: berpindah antar Lokasi Mitra sendiri; tersembunyi bila hanya mengelola satu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LokasiSwitcher
              current="a"
              lokasi={[
                { value: "a", label: "Makam Wakaf Al-Ikhlas", href: "#" },
                { value: "b", label: "TPU Keluarga Sentosa", href: "#" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ThemeToggle</CardTitle>
            <CardDescription>Terang, Gelap, Ikuti perangkat — khusus area staf.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>BrandLogo, BrandMark</CardTitle>
            <CardDescription>Logo sementara sampai master vektor dari desainer brand tersedia.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            <BrandLogo caption="Area Staf" />
            <BrandMark />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ThemeProvider</CardTitle>
            <CardDescription>
              Membungkus seluruh aplikasi (next-themes); halaman publik, Masuk, Akun Saya dan langkah TOTP tetap terang. Tidak
              punya tampilan sendiri — lihat ThemeToggle di atas untuk efeknya.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <p className="text-small text-muted-foreground">
        <Link href="/staf/admin-platform" className="text-brand underline underline-offset-2">
          Kembali ke Admin Platform
        </Link>
      </p>
    </div>
  );
}
