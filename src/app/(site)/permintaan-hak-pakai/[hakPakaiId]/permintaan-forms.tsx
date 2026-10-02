"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ajukanGantiPemegangHakAction,
  ajukanPengembalianAction,
  ajukanUlangPermintaanAction,
  batalkanPermintaanAction,
  ubahCalonPenghuniAction,
  type PermintaanActionState,
} from "./actions";

const idle: PermintaanActionState = { status: "idle" };

function Umpanbalik({ state }: { state: PermintaanActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-small text-muted-foreground">
      {state.message}
    </p>
  );
}

function Isian({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
      </label>
      <Input id={id} {...props} />
    </div>
  );
}

/** "Kembalikan Hak Pakai": the screen warns, before the button, that compensation is agreed directly with the Lokasi. */
export function KembalikanForm({ hakPakaiId }: { hakPakaiId: string }) {
  const [state, action, pending] = useActionState(ajukanPengembalianAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <Isian id="catatan-pengembalian" name="catatan" label="Catatan untuk Lokasi Mitra (boleh dikosongkan)" maxLength={500} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="ajukan-pengembalian">
          {pending ? "Mengajukan…" : "Kembalikan Hak Pakai"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** "Ajukan Ganti Pemegang Hak": the new holder's name, phone and email (when known), jual or waris, optional documents. */
export function GantiForm({ hakPakaiId, jualDiizinkan }: { hakPakaiId: string; jualDiizinkan: boolean }) {
  const [state, action, pending] = useActionState(ajukanGantiPemegangHakAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <Isian id="ganti-nama" name="name" label="Nama Pemegang Hak baru" required maxLength={200} />
      <Isian id="ganti-telepon" name="phoneNumber" label="Nomor telepon Pemegang Hak baru" type="tel" required maxLength={30} />
      <Isian id="ganti-email" name="email" label="Email Pemegang Hak baru (jika diketahui)" type="email" maxLength={320} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium text-foreground">Sebab</legend>
        <label className="flex items-center gap-2 text-body">
          <input type="radio" name="sebab" value="waris" defaultChecked /> Waris
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="radio" name="sebab" value="jual" disabled={!jualDiizinkan} /> Jual{jualDiizinkan ? "" : " (tidak diizinkan oleh Lokasi Mitra ini)"}
        </label>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor="ganti-berkas" className="text-body font-medium text-foreground">
          Dokumen pendukung (boleh dikosongkan; JPEG, PNG atau PDF, paling banyak 5)
        </label>
        <input id="ganti-berkas" name="berkas" type="file" multiple accept="image/jpeg,image/png,application/pdf" className="text-body" />
      </div>
      <Isian id="ganti-catatan" name="catatan" label="Catatan (boleh dikosongkan)" maxLength={500} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="ajukan-ganti">
          {pending ? "Mengajukan…" : "Ajukan Ganti Pemegang Hak"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

export function AjukanUlangForm({ hakPakaiId, id }: { hakPakaiId: string; id: string }) {
  const [state, action, pending] = useActionState(ajukanUlangPermintaanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="id" value={id} />
      <Isian id="catatan-ulang" name="catatan" label="Catatan baru (boleh dikosongkan)" maxLength={500} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="ajukan-ulang-permintaan">
          {pending ? "Mengajukan…" : "Ajukan kembali"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

export function BatalkanForm({ hakPakaiId, id }: { hakPakaiId: string; id: string }) {
  const [state, action, pending] = useActionState(batalkanPermintaanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid="tarik-permintaan">
          {pending ? "Menarik…" : "Tarik permintaan ini"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** One Petak's Calon Penghuni label on the Makam tab: changed freely, no review. */
export function CalonPenghuniForm({ hakPakaiId, petakId, nomor, label }: { hakPakaiId: string; petakId: string; nomor: string; label: string | null }) {
  const [state, action, pending] = useActionState(ubahCalonPenghuniAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="form-calon-penghuni">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="petakId" value={petakId} />
      <label htmlFor={`calon-${petakId}`} className="text-small font-medium text-foreground">
        Calon Penghuni {nomor}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={`calon-${petakId}`} name="label" defaultValue={label ?? ""} maxLength={200} className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      <Umpanbalik state={state} />
    </form>
  );
}
