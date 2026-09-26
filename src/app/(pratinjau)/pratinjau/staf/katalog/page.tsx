import { readFileSync } from "node:fs";
import path from "node:path";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import { StatusBadge, statusVocabulary, type StatusKey } from "@/components/makam/status-badge";
import { ButtonsDemo, ConfirmDialogDemo, DataTableDemo, FormSectionDemo, StatesDemo, SwitchersDemo } from "./demos";

/**
 * PROTOTYPE (f): the design system catalogue. Colour values are read from
 * globals.css at request time, so this page cannot drift from the tokens.
 */

function tokens() {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const parse = (text: string) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const light = parse(block(":root"));
  const dark = { ...light, ...parse(block(".dark")) };
  const resolve = (map: Record<string, string>, name: string) => {
    let value = map[name];
    while (value?.startsWith("var(--")) value = map[value.slice(6, -1)];
    return value ?? "";
  };
  return { light: (name: string) => resolve(light, name), dark: (name: string) => resolve(dark, name) };
}

const colourGroups: { title: string; note: string; names: string[] }[] = [
  { title: "Permukaan", note: "Latar halaman, kartu, sidebar. Abu-abu dengan sedikit rona merek.", names: ["background", "card", "subtle", "muted", "sidebar", "popover"] },
  { title: "Teks dan garis", note: "Teks utama, teks pendukung (≥ 4,5:1 di semua permukaan), garis dan fokus.", names: ["foreground", "muted-foreground", "border", "border-strong", "input", "ring"] },
  { title: "Merek: Kamboja", note: "Hanya untuk aksi utama, tempat saat ini (menu aktif, tab) dan fokus.", names: ["brand", "brand-foreground", "brand-soft", "brand-soft-foreground"] },
  {
    title: "Semantik",
    note: "Isi (solid) untuk titik, ikon dan bilah; soft untuk latar lencana dan banner dengan teks -soft-foreground.",
    names: ["success", "success-soft", "success-soft-foreground", "warning", "warning-soft", "warning-soft-foreground", "danger", "danger-soft", "danger-soft-foreground", "info", "info-soft", "info-soft-foreground", "neutral-soft", "neutral-soft-foreground"],
  },
];

const typeScale = [
  { cls: "text-display", name: "display", spec: "30/36, 600, -0.022em", use: "Angka di StatCard" },
  { cls: "text-title-1", name: "title-1", spec: "24/32, 600, -0.018em", use: "Judul halaman (satu h1)" },
  { cls: "text-title-2", name: "title-2", spec: "18/26, 600, -0.01em", use: "Judul bagian" },
  { cls: "text-title-3", name: "title-3", spec: "15/22, 550", use: "Judul panel, kartu, dialog" },
  { cls: "text-body-lg", name: "body-lg", spec: "16/24, 400", use: "Isian di ponsel, teks panjang" },
  { cls: "text-body", name: "body", spec: "14/20, 400", use: "Teks dasar Area Staf" },
  { cls: "text-small", name: "small", spec: "13/18, 400", use: "Keterangan, meta, sel tabel sekunder" },
  { cls: "text-caption", name: "caption", spec: "12/16, 400–500", use: "Lencana, kepala tabel, jam" },
];

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const radii = [
  { cls: "rounded-sm", name: "sm", px: "4.8px", use: "Kbd, chip kecil" },
  { cls: "rounded-md", name: "md", px: "6.4px", use: "Lencana, item menu" },
  { cls: "rounded-lg", name: "lg", px: "8px", use: "Tombol, isian, kartu, tabel" },
  { cls: "rounded-xl", name: "xl", px: "11.2px", use: "Dialog, popover" },
  { cls: "rounded-full", name: "full", px: "∞", use: "Avatar, titik status" },
];
const shadows = [
  { cls: "shadow-xs", name: "xs", use: "Segmen aktif" },
  { cls: "shadow-sm", name: "sm", use: "Jarang; permukaan diam memakai garis" },
  { cls: "shadow-md", name: "md", use: "Popover, menu" },
  { cls: "shadow-lg", name: "lg", use: "Dialog, sheet" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 id={`${id}-judul`} className="text-title-2">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-small text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ value, surface }: { value: string; surface: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ background: surface }}>
        <span className="size-7 rounded-[5px] ring-1 ring-black/10 ring-inset" style={{ background: value }} />
      </span>
      <code className="truncate font-mono text-[0.6875rem] text-muted-foreground">{value}</code>
    </div>
  );
}

export default function KatalogPratinjau() {
  const t = tokens();
  const statuses = Object.keys(statusVocabulary) as StatusKey[];
  return (
    <>
      <PageHeader
        title="Katalog design system"
        description="Token, skala dan komponen makam dalam satu halaman. Sumber kebenarannya globals.css dan src/components/makam; dokumentasinya docs/design-system.md."
      />

      <nav aria-label="Isi katalog" className="-mt-4 flex flex-wrap gap-x-4 gap-y-1 text-small">
        {["warna", "tipografi", "spasi", "radius", "bayangan", "status", "komponen", "keadaan"].map((id) => (
          <a key={id} href={`#${id}`} className="font-medium text-brand underline-offset-4 hover:underline">
            {id[0].toUpperCase() + id.slice(1)}
          </a>
        ))}
      </nav>

      <Section id="warna" title="Warna" description="Setiap token punya nilai terang dan gelap. Komponen memakai nama semantik, tidak pernah warna mentah.">
        <div className="flex flex-col gap-8">
          {colourGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <div>
                <h3 className="text-title-3">{group.title}</h3>
                <p className="text-small text-muted-foreground">{group.note}</p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-[40rem] table-fixed text-small">
                  <colgroup>
                    <col className="w-64" />
                    <col />
                    <col />
                  </colgroup>
                  <thead className="bg-subtle text-caption text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Token</th>
                      <th className="px-4 py-2 text-left font-medium">Terang</th>
                      <th className="px-4 py-2 text-left font-medium">Gelap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.names.map((name) => (
                      <tr key={name}>
                        <td className="px-4 py-2 font-mono text-caption">--{name}</td>
                        <td className="px-4 py-2">
                          <Swatch value={t.light(name)} surface={t.light("background")} />
                        </td>
                        <td className="px-4 py-2">
                          <Swatch value={t.dark(name)} surface={t.dark("background")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="tipografi" title="Tipografi" description="Satu keluarga: Geist. Geist Mono hanya untuk kode yang disalin orang (Nomor Pemesanan, nomor rekening). Angka di tabel memakai tabular-nums.">
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {typeScale.map((item) => (
            <li key={item.name} className="grid items-baseline gap-2 px-5 py-4 md:grid-cols-[9rem_minmax(0,1fr)_14rem]">
              <code className="font-mono text-caption text-muted-foreground">{item.name}</code>
              <p className={item.cls}>Taman Makam Wakaf Al-Ikhlas</p>
              <p className="text-caption text-muted-foreground">
                {item.spec}. {item.use}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-(--section-gap) lg:grid-cols-2">
        <Section id="spasi" title="Spasi" description="Kelipatan 4px dari Tailwind. Celah antarbagian halaman 32px, di dalam panel 16–20px.">
          <ul className="flex flex-col gap-2">
            {spacing.map((step) => (
              <li key={step} className="grid grid-cols-[5rem_3rem_minmax(0,1fr)] items-center gap-3 text-small">
                <code className="font-mono text-caption">--space-{step}</code>
                <span className="text-muted-foreground tabular-nums">{step * 4}px</span>
                <span className="h-3 rounded-sm bg-brand/70" style={{ width: `${step * 4}px` }} />
              </li>
            ))}
          </ul>
        </Section>

        <Section id="radius" title="Radius" description="Satu dasar (--radius: 8px), turunan untuk hierarki. Makin besar permukaannya, makin besar radiusnya.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {radii.map((item) => (
              <li key={item.name} className="flex flex-col gap-2">
                <span className={`h-14 border border-border-strong bg-muted ${item.cls}`} />
                <span className="text-small">
                  <code className="font-mono text-caption">{item.name}</code> <span className="text-muted-foreground">{item.px}</span>
                </span>
                <span className="text-caption text-muted-foreground">{item.use}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section id="bayangan" title="Bayangan dan gerak" description="Bayangan menandai ketinggian (menu, dialog), bukan hiasan. Gerak hanya menjawab aksi: 140ms untuk hover dan tekan, 200ms untuk membuka, 320ms untuk sheet. prefers-reduced-motion mematikannya.">
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {shadows.map((item) => (
            <li key={item.name} className="flex flex-col gap-2">
              <span className={`h-16 rounded-lg bg-card ${item.cls}`} />
              <span className="text-small">
                <code className="font-mono text-caption">shadow-{item.name}</code>
              </span>
              <span className="text-caption text-muted-foreground">{item.use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="status" title="StatusBadge" description="Satu kosakata untuk semua status domain. Nada membawa makna: hijau beres, kuning perlu perhatian, merah lewat tenggat, biru menunggu orang lain, abu-abu belum mulai atau sudah berakhir.">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] text-small">
            <thead className="bg-subtle text-caption text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Lencana</th>
                <th className="px-4 py-2 text-left font-medium">Kunci</th>
                <th className="px-4 py-2 text-left font-medium">Nada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statuses.map((key) => (
                <tr key={key}>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={key} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-caption">{key}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{statusVocabulary[key].tone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="komponen" title="Komponen makam" description="Komposisi di src/components/makam, dibangun dari primitif shadcn.">
        <div className="flex flex-col gap-8">
          <Demo name="PageHeader">
            <div className="rounded-lg border border-dashed border-border-strong p-5">
              <PageHeader title="Lokasi Mitra" status={<StatusBadge status="terverifikasi" />} description="Satu h1, status di sampingnya, aksi di kanan." />
            </div>
          </Demo>
          <Demo name="StatCard">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Lokasi Mitra aktif" value={9} note="3 Belum Tayang" />
              <StatCard label="Antrean hari ini" value={17} note="2 lewat tenggat dalam 1 jam" attention="warning" />
              <StatCard label="Tagihan lewat jatuh tempo" value={4} note="Rp 18.450.000 belum dibayar" attention="danger" />
            </div>
          </Demo>
          <Demo name="DataTable">
            <DataTableDemo />
          </Demo>
          <Demo name="FormSection">
            <FormSectionDemo />
          </Demo>
          <Demo name="ConfirmDialog">
            <ConfirmDialogDemo />
          </Demo>
          <Demo name="RoleSwitcher, LokasiSwitcher, ThemeToggle">
            <SwitchersDemo />
          </Demo>
          <Demo name="Button (primitif shadcn)">
            <ButtonsDemo />
          </Demo>
        </div>
      </Section>

      <Section id="keadaan" title="Keadaan kosong, memuat dan galat" description="Seragam di semua halaman: kosong mengajak bertindak, memuat memakai kerangka seukuran isinya, galat bilang apa yang terjadi dan cara mencoba lagi.">
        <StatesDemo />
      </Section>
    </>
  );
}

function Demo({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-small text-muted-foreground">{name}</h3>
      {children}
    </div>
  );
}
