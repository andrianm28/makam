import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JenisPenguburan } from "@/domain/pengurusan/skema-pengurusan";
import { perluPersetujuanTumpang } from "../draft";

/**
 * The family's confirmation that it understands what a Tumpang at a TPU asks of it (owner rule C3, 2026-10-05): the IPTM of
 * the grave still in force, the earlier burial three years or more ago, and, when the grave is not the family's own, the
 * Pemegang Hak's written consent. It sits under the grave's own fields, where the warning that states the same is read.
 *
 * Kirim stays disabled until it is ticked (`TombolKirimTpu`), and the Server Action refuses a Tumpang without it
 * (`draftTpuSchema`): the box is how the screen asks, the schema is what holds.
 */
export function PersetujuanTumpang({ setuju, onUbah, error }: { setuju: boolean; onUbah: (setuju: boolean) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="persetujuan-tumpang" className="flex items-start gap-3 rounded-lg border border-input bg-card p-3 text-body text-foreground">
        <input
          id="persetujuan-tumpang"
          type="checkbox"
          required
          checked={setuju}
          onChange={(event) => onUbah(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "persetujuan-tumpang-galat" : undefined}
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <span>
          Saya paham syarat Tumpang: IPTM makam itu masih berlaku, pemakaman sebelumnya sudah 3 tahun atau lebih, dan bila bukan makam keluarga sendiri, saya menyiapkan surat
          persetujuan tertulis Pemegang Hak makam yang ditumpang.
        </span>
      </label>
      {error ? (
        <p id="persetujuan-tumpang-galat" role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The form's Kirim: locked while a Kirim is in flight, for a family a TPU cannot serve, and, for a Tumpang, until its family has
 * ticked the consent. A new grave never waits for the box.
 */
export function TombolKirimTpu({
  mengirim,
  tidakLayak,
  jenis,
  setuju,
  onKlik,
}: {
  mengirim: boolean;
  tidakLayak: boolean;
  jenis: JenisPenguburan;
  setuju: boolean;
  onKlik: () => void;
}) {
  const menungguPersetujuan = perluPersetujuanTumpang(jenis) && !setuju;
  return (
    <>
      <Button type="button" size="lg" disabled={mengirim || tidakLayak || menungguPersetujuan} onClick={onKlik} className="h-12 px-6 text-body-lg">
        {mengirim ? "Mengirim…" : "Kirim pengurusan"} <ArrowRight aria-hidden />
      </Button>
      {menungguPersetujuan ? <p className="text-center text-small text-muted-foreground">Centang persetujuan syarat Tumpang di atas untuk mengirim.</p> : null}
    </>
  );
}
