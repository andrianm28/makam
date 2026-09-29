"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ajukanPembatalanAction,
  ajukanUlangPembatalanAction,
  batalkanPermintaanPembatalanAction,
  type PembatalanActionState,
} from "./actions";

const idle: PembatalanActionState = { status: "idle" };

/** What a form says back: a refusal is an alert, a success a status. */
function Umpanbalik({ state }: { state: PembatalanActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-small text-muted-foreground">
      {state.message}
    </p>
  );
}

/** "Ajukan Pembatalan": the reason is the family's own words and may stay empty; the refund is the module's, shown above the form. */
export function AjukanPembatalanForm({ hakPakaiId }: { hakPakaiId: string }) {
  const [state, action, pending] = useActionState(ajukanPembatalanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="catatan-pembatalan" className="text-body font-medium text-foreground">
          Alasan Pembatalan (boleh dikosongkan)
        </label>
        <Input id="catatan-pembatalan" name="catatan" maxLength={500} />
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="ajukan-pembatalan">
          {pending ? "Mengajukan…" : "Ajukan Pembatalan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** A request the Lokasi Mitra sent back: fix it with a new note if needed and file it again. */
export function AjukanUlangForm({ hakPakaiId, id }: { hakPakaiId: string; id: string }) {
  const [state, action, pending] = useActionState(ajukanUlangPembatalanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2">
        <label htmlFor="catatan-ajukan-ulang" className="text-body font-medium text-foreground">
          Catatan baru (boleh dikosongkan)
        </label>
        <Input id="catatan-ajukan-ulang" name="catatan" maxLength={500} />
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="ajukan-ulang-pembatalan">
          {pending ? "Mengajukan…" : "Ajukan kembali"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** Withdrawing a request before a decision. */
export function BatalkanPermintaanForm({ hakPakaiId, id }: { hakPakaiId: string; id: string }) {
  const [state, action, pending] = useActionState(batalkanPermintaanPembatalanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="hakPakaiId" value={hakPakaiId} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid="tarik-permintaan-pembatalan">
          {pending ? "Menarik…" : "Tarik permintaan ini"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}
