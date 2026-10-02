"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../../../form-state";
import { akhiriHakPakaiAction, catatPembongkaranAction, ubahKontakPemegangHakAction } from "./actions";

const idle: FormState = { status: "idle" };

function Umpanbalik({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

/** Ending a Hak Pakai by hand needs a reason, which the audit log keeps; it cannot be undone. */
export function AkhiriForm({ lokasiId, hakPakaiId }: { lokasiId: string; hakPakaiId: string }) {
  const [state, action, pending] = useActionState(akhiriHakPakaiAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan mengakhiri
        <Input name="alasan" required maxLength={300} />
      </label>
      <p className="text-small text-muted-foreground">Hak Pakai yang diakhiri tidak bisa dihidupkan lagi. Petak tetap Terisi sampai Pembongkaran dicatat.</p>
      <Button type="submit" variant="destructive" disabled={pending} className="self-start">
        Akhiri Hak Pakai
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}

export function PembongkaranForm({ lokasiId, hakPakaiId }: { lokasiId: string; hakPakaiId: string }) {
  const [state, action, pending] = useActionState(catatPembongkaranAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <p className="text-small text-muted-foreground">Catat setelah makam dibongkar. Petak lalu Tersedia lagi.</p>
      <Button type="submit" disabled={pending} className="self-start">
        Catat Pembongkaran
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}

/** Changing the Pemegang Hak's phone number or recorded email: only after a KTP check, which is uploaded here. */
export function UbahKontakForm({ lokasiId, hakPakaiId }: { lokasiId: string; hakPakaiId: string }) {
  const [state, action, pending] = useActionState(ubahKontakPemegangHakAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor telepon baru
        <Input name="phoneNumber" type="tel" required maxLength={30} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email baru (boleh dikosongkan; Makam Keluarga dicocokkan lewat email)
        <Input name="email" type="email" maxLength={320} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Hasil pemeriksaan KTP (JPEG, PNG atau PDF)
        <input name="ktp" type="file" required accept="image/jpeg,image/png,application/pdf" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan
        <Input name="alasan" required maxLength={300} />
      </label>
      <Button type="submit" disabled={pending} className="self-start" data-testid="ubah-kontak-pemegang">
        Ubah kontak
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}
