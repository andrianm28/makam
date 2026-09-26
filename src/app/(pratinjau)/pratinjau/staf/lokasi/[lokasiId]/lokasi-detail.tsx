"use client";

import { CalendarOffIcon, CheckCircle2Icon, CircleDashedIcon, ClockIcon, InfoIcon, MailPlusIcon, PencilIcon, UserPlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { auditActionLabels } from "@/app/staf/lokasi/labels";
import { ConfirmDialog } from "@/components/makam/confirm-dialog";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminLokasi, auditLog, jamOperasional, tarifJenisMakam, type MockLokasi } from "../../_mock/data";
import type { LokasiTab } from "./page";

const tabLabels: Record<LokasiTab, string> = {
  ringkasan: "Ringkasan",
  tarif: "Tarif",
  "jam-operasional": "Jam Operasional",
  "admin-lokasi": "Admin Lokasi",
  "audit-log": "Audit Log",
};

export function LokasiDetail({ lokasi, initialTab }: { lokasi: MockLokasi; initialTab: LokasiTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<LokasiTab>(initialTab);

  return (
    <>
      <PageHeader
        title={lokasi.name}
        status={<StatusBadge status={lokasi.status} />}
        description={`${lokasi.pengelola}, ${lokasi.kota}`}
        actions={
          <>
            {lokasi.status === "terverifikasi" ? (
              <ConfirmDialog
                trigger={<Button variant="outline" className="text-danger-soft-foreground" />}
                triggerLabel="Tangguhkan"
                title={`Tangguhkan ${lokasi.name}?`}
                description="Lokasi ini hilang dari daftar dan tidak menerima Hak Pakai baru. Pemakaman, Perpanjangan, Layanan dan pesanan yang sedang berjalan tetap berlanjut."
                confirmLabel="Tangguhkan"
                destructive
                reasonLabel="Alasan penangguhan"
                onConfirm={() => toast.success(`${lokasi.name} ditangguhkan`, { description: "Pratinjau: tidak ada yang disimpan." })}
              />
            ) : null}
            <Button>
              <PencilIcon aria-hidden /> Ubah profil
            </Button>
          </>
        }
      >
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-small">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Petak Makam</dt>
            <dd className="font-medium tabular-nums">{lokasi.petak.toLocaleString("id-ID")}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Admin Lokasi</dt>
            <dd className="font-medium tabular-nums">{lokasi.adminLokasi}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Kontak Siaga</dt>
            <dd className="font-medium">{lokasi.adminLokasi > 0 ? adminLokasi[0].nama : "Belum dipilih"}</dd>
          </div>
        </dl>
      </PageHeader>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as LokasiTab;
          setTab(next);
          router.replace(next === "ringkasan" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
        }}
        className="gap-6"
      >
        <div className="-mx-(--page-gutter) overflow-x-auto border-b border-border px-(--page-gutter)">
          <TabsList variant="line" className="h-10 gap-4 p-0">
            {(Object.keys(tabLabels) as LokasiTab[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex-none px-0.5 text-body after:bg-brand group-data-horizontal/tabs:after:bottom-[-1px]"
              >
                {tabLabels[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="ringkasan">
          <Ringkasan lokasi={lokasi} />
        </TabsContent>
        <TabsContent value="tarif">
          <TarifTab lokasi={lokasi} />
        </TabsContent>
        <TabsContent value="jam-operasional">
          <JamOperasionalTab lokasi={lokasi} />
        </TabsContent>
        <TabsContent value="admin-lokasi">
          <AdminLokasiTab lokasi={lokasi} />
        </TabsContent>
        <TabsContent value="audit-log">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Panel({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-lg border border-border bg-card", className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-5 py-2">
        <h2 className="text-title-3">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Ringkasan({ lokasi }: { lokasi: MockLokasi }) {
  const facts: [string, string][] = [
    ["Pengelola", lokasi.pengelola],
    ["Alamat", "Jl. Pangeran Antasari No. 17, Cilandak Barat, " + lokasi.kota],
    ["Jenis", "Pemakaman wakaf"],
    ["Rekening Pencairan", "BSI 7123 4455 90 a.n. " + lokasi.pengelola],
    ["Perjanjian", "Ditandatangani 12 September 2026"],
  ];
  const gate = [
    { label: "Perjanjian ditandatangani", done: true },
    { label: "Kunjungan Verifikasi selesai", done: lokasi.status !== "belum_tayang" },
    { label: "Tarif Diperiksa", done: lokasi.tarifDiperiksa },
    { label: "Jam Operasional diisi Admin Lokasi", done: lokasi.jamOperasional },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel title="Profil">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-small text-muted-foreground">{term}</dt>
              <dd className="text-body">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Syarat tayang">
        <ul className="flex flex-col gap-3">
          {gate.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5 text-body">
              {item.done ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-label="Sudah" />
              ) : (
                <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Belum" />
              )}
              <span className={item.done ? undefined : "text-muted-foreground"}>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-small text-muted-foreground">
          {gate.every((item) => item.done)
            ? "Semua syarat terpenuhi. Lokasi ini boleh tayang."
            : "Lokasi ini tetap Belum Tayang sampai semua syarat terpenuhi."}
        </p>
      </Panel>
    </div>
  );
}

function TarifTab({ lokasi }: { lokasi: MockLokasi }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border border-info/25 bg-info-soft px-4 py-3 text-small text-info-soft-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Harga baru mulai 1 Oktober 2026 untuk Petak tunggal, 5 tahun. Versi yang berlaku sekarang tidak berubah.</p>
      </div>
      <Panel
        title="Harga Hak Pakai per Jenis Makam"
        action={
          lokasi.tarifDiperiksa ? (
            <span className="flex items-center gap-1.5 text-small text-success-soft-foreground">
              <CheckCircle2Icon className="size-4" aria-hidden /> Tarif Diperiksa
            </span>
          ) : (
            <Button variant="outline" size="sm">
              Tandai Tarif Diperiksa
            </Button>
          )
        }
        className="[&>div:last-child]:p-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5">Jenis Makam</TableHead>
              <TableHead className="text-right">Harga Hak Pakai</TableHead>
              <TableHead>Masa Hak Pakai</TableHead>
              <TableHead className="pr-5 text-right">Perpanjangan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tarifJenisMakam.map((row) => (
              <TableRow key={row.jenis}>
                <TableCell className="px-5 py-3 font-medium">{row.jenis}</TableCell>
                <TableCell className="text-right tabular-nums">{row.harga}</TableCell>
                <TableCell>{row.masa}</TableCell>
                <TableCell className="pr-5 text-right tabular-nums">{row.perpanjangan}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t border-border px-5 py-3 text-small text-muted-foreground">Harga berlaku sejak 1 Agustus 2026.</p>
      </Panel>
      <Panel title="Biaya Pemakaman">
        <div className="flex flex-wrap gap-x-12 gap-y-3">
          <div>
            <p className="text-small text-muted-foreground">Per Pemakaman</p>
            <p className="text-title-2 tabular-nums">Rp 1.500.000</p>
          </div>
          <div>
            <p className="text-small text-muted-foreground">Tumpang</p>
            <p className="text-title-2 tabular-nums">Rp 1.250.000</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function JamOperasionalTab({ lokasi }: { lokasi: MockLokasi }) {
  if (!lokasi.jamOperasional) {
    return (
      <EmptyState
        icon={ClockIcon}
        title="Jam Operasional belum diisi"
        description="Admin Lokasi mengisinya dari Area Staf. Sampai itu, tidak ada janji konfirmasi Saat Duka atau tenggat Hari Kerja untuk lokasi ini."
        action={
          <Button variant="outline">
            <MailPlusIcon aria-hidden /> Ingatkan Admin Lokasi
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel title="Jam mingguan" className="[&>div:last-child]:p-0">
        <ul className="divide-y divide-border">
          {jamOperasional.map((row) => (
            <li key={row.hari} className="flex items-center justify-between px-5 py-3 text-body">
              <span className="font-medium">{row.hari}</span>
              <span className={cn("tabular-nums", row.jam === "Tutup" && "text-muted-foreground")}>{row.jam}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="flex flex-col gap-6">
        <Panel title="Tanggal Tutup">
          <ul className="flex flex-col gap-2 text-body">
            <li className="flex items-center gap-2">
              <CalendarOffIcon className="size-4 text-muted-foreground" aria-hidden /> Jumat, 16 Oktober 2026
            </li>
            <li className="flex items-center gap-2">
              <CalendarOffIcon className="size-4 text-muted-foreground" aria-hidden /> Kamis, 24 Desember 2026
            </li>
          </ul>
        </Panel>
        <Panel title="Kontak Siaga">
          <p className="text-body font-medium">{adminLokasi[0].nama}</p>
          <p className="text-small text-muted-foreground">{adminLokasi[0].telepon}, dihubungi keluarga di luar Jam Operasional</p>
        </Panel>
      </div>
    </div>
  );
}

function AdminLokasiTab({ lokasi }: { lokasi: MockLokasi }) {
  const people = adminLokasi.slice(0, lokasi.adminLokasi);
  if (people.length === 0) {
    return (
      <EmptyState
        icon={UserPlusIcon}
        title="Belum ada Admin Lokasi"
        description="Undang minimal satu Admin Lokasi. Dia mengisi Jam Operasional, Denah dan menjawab pesanan."
        action={
          <Button>
            <UserPlusIcon aria-hidden /> Undang Admin Lokasi
          </Button>
        }
      />
    );
  }
  return (
    <Panel
      title={`${people.length} Admin Lokasi`}
      action={
        <Button variant="outline" size="sm">
          <UserPlusIcon aria-hidden /> Undang Admin Lokasi
        </Button>
      }
      className="[&>div:last-child]:p-0"
    >
      <ul className="divide-y divide-border">
        {people.map((person) => (
          <li key={person.nama} className="flex items-center gap-3 px-5 py-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-caption font-medium">
                {person.nama
                  .replace("Hj. ", "")
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-body font-medium">
                {person.nama}
                {person.kontakSiaga ? (
                  <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-caption font-medium text-brand-soft-foreground">Kontak Siaga</span>
                ) : null}
              </span>
              <span className="truncate text-small text-muted-foreground">
                {person.telepon}, {person.email}
              </span>
            </div>
            <ConfirmDialog
              trigger={<Button variant="ghost" size="sm" />}
              triggerLabel="Lepas"
              title={`Lepas ${person.nama} dari lokasi ini?`}
              description="Dia tidak lagi melihat pesanan dan Antrean Lokasi ini. Akun Stafnya tetap ada."
              confirmLabel="Lepas Admin Lokasi"
              destructive
              reasonLabel="Alasan"
              onConfirm={() => toast.success("Admin Lokasi dilepas", { description: "Pratinjau: tidak ada yang disimpan." })}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AuditLogTab() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader className="bg-subtle">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-5">Waktu</TableHead>
            <TableHead>Staf</TableHead>
            <TableHead>Aksi</TableHead>
            <TableHead className="pr-5">Alasan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {auditLog.map((entry) => (
            <TableRow key={entry.waktu + entry.aksi}>
              <TableCell className="px-5 py-3 text-small text-muted-foreground tabular-nums">{entry.waktu}</TableCell>
              <TableCell>
                <span className="flex flex-col">
                  <span className="font-medium">{entry.staf}</span>
                  <span className="text-caption text-muted-foreground">{entry.peran}</span>
                </span>
              </TableCell>
              <TableCell>{auditActionLabels[entry.aksi]}</TableCell>
              <TableCell className="pr-5 whitespace-normal text-muted-foreground">{entry.alasan || "Tanpa alasan"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
