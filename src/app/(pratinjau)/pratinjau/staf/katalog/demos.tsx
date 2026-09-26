"use client";

import { AlertTriangleIcon, InboxIcon, RotateCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/makam/confirm-dialog";
import { EmptyState } from "@/components/makam/empty-state";
import { FormSection } from "@/components/makam/form-section";
import { LokasiSwitcher } from "@/components/makam/lokasi-switcher";
import { RoleSwitcher } from "@/components/makam/role-switcher";
import { ThemeToggle } from "@/components/makam/theme-toggle";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { lokasiAdminLokasi, lokasiMitra } from "../_mock/data";
import { LokasiTable } from "../lokasi/lokasi-table";
import { roleHome, roleLabels } from "../_shell/nav";

const roles = (Object.keys(roleLabels) as (keyof typeof roleLabels)[]).map((role) => ({ value: role, label: roleLabels[role], href: roleHome[role] }));

export function SwitchersDemo() {
  const [lokasi, setLokasi] = useState(lokasiAdminLokasi[0].id);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <RoleSwitcher roles={roles} current="admin_platform" />
      <LokasiSwitcher lokasi={lokasiAdminLokasi} currentId={lokasi} onSelect={setLokasi} />
      <ThemeToggle />
    </div>
  );
}

export function ButtonsDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Simpan</Button>
      <Button variant="outline">Batalkan perubahan</Button>
      <Button variant="secondary">Sekunder</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Hapus (lunak)</Button>
      <Button variant="link">Tautan</Button>
      <Button disabled>Nonaktif</Button>
    </div>
  );
}

export function ConfirmDialogDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={<Button variant="outline" className="text-danger-soft-foreground" />}
        triggerLabel="Nonaktifkan Akun Staf"
        title="Nonaktifkan Akun Staf Dimas Prasetyo?"
        description="Dia langsung keluar dari semua perangkat dan tidak bisa masuk lagi. Riwayatnya di Audit Log tetap ada."
        confirmLabel="Nonaktifkan"
        destructive
        reasonLabel="Alasan"
        onConfirm={() => toast.success("Akun Staf dinonaktifkan", { description: "Pratinjau: tidak ada yang disimpan." })}
      />
      <ConfirmDialog
        trigger={<Button variant="outline" />}
        triggerLabel="Tandai Tarif Diperiksa"
        title="Tandai Tarif sudah diperiksa?"
        description="Anda menyatakan Tarif lokasi ini cocok dengan perjanjian. Ini salah satu syarat tayang."
        confirmLabel="Tandai diperiksa"
        onConfirm={() => toast.success("Tarif ditandai sudah diperiksa")}
      />
    </div>
  );
}

export function FormSectionDemo() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <FormSection title="Layanan pelanggan" description="Nomor ini muncul di tombol WhatsApp CS.">
        <Field>
          <FieldLabel htmlFor="demo-jam">Jam balas CS</FieldLabel>
          <Input id="demo-jam" defaultValue="Dibalas mulai pukul 06.00" />
          <FieldDescription>Ditampilkan di samping tombol WhatsApp CS.</FieldDescription>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="demo-wa">Nomor WhatsApp CS</FieldLabel>
          <Input id="demo-wa" defaultValue="0812 3456" aria-invalid />
          <FieldError errors={[{ message: "Nomor WhatsApp CS diawali 08 atau 628, 10 sampai 13 angka tanpa spasi." }]} />
        </Field>
      </FormSection>
    </div>
  );
}

export function DataTableDemo() {
  return <LokasiTable data={lokasiMitra.slice(0, 5)} />;
}

export function StatesDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <p className="text-small font-medium">Kosong</p>
        <EmptyState
          icon={InboxIcon}
          title="Antrean kosong"
          description="Semua pekerjaan sudah beres. Baris baru muncul di sini saat ada pesanan, pembayaran atau Lokasi yang butuh Anda."
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-small font-medium">Memuat</p>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-busy="true" aria-label="Memuat">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
          <div className="flex flex-col gap-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-small font-medium">Galat</p>
        <EmptyState
          icon={AlertTriangleIcon}
          tone="error"
          title="Daftar Lokasi Mitra gagal dimuat"
          description="Server tidak menjawab dalam 10 detik. Data Anda aman; muat ulang untuk mencoba lagi."
          action={
            <Button variant="outline">
              <RotateCwIcon aria-hidden /> Coba lagi
            </Button>
          }
        />
      </div>
    </div>
  );
}
