import { BellRingIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AntreanRow, PetugasBertugas } from "@/domain/queues";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { NyalakanBertugasForm, TurunDariBertugasForm, type KlaimSaya } from "./bertugas-forms";

/**
 * Who is Bertugas now, at the top of the Antrean (spec, Work Queues: "who is
 * Bertugas now is shown at the top of the Antrean; switching it on needs at
 * least one active Perangkat Push, ADR 0004").
 *
 * The rota lives outside the platform: this is whoever switched themselves on,
 * and when their duty ends by rule (18:00 WIB or 12 h). Coming off duty by hand
 * asks about every Ambil claim still held.
 */
export function BertugasPanel({
  petugas,
  accountIdSaya,
  emailByAccountId,
  klaimSaya,
  pesan,
}: {
  petugas: PetugasBertugas[];
  /** The signed-in Admin Platform's own account id. */
  accountIdSaya: string;
  emailByAccountId: Map<string, string>;
  klaimSaya: AntreanRow[];
  /** What switching Bertugas on or off just did, from the action's redirect. */
  pesan?: { role: "status" | "alert"; text: string };
}) {
  const sayaBertugas = petugas.some((satu) => satu.accountId === accountIdSaya);
  const klaim: KlaimSaya[] = klaimSaya.map((row) => ({
    type: row.type,
    subjectId: row.subjectId,
    label: row.label,
    subjectLabel: row.subjectLabel,
  }));
  return (
    <section aria-label="Bertugas" className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-body font-medium text-foreground">Bertugas</p>
            {petugas.length === 0 ? (
              <p className="text-small text-muted-foreground">
                Tidak ada yang Bertugas sekarang, jadi setiap Tier 1 baru sampai ke semua Admin Platform.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {petugas.map((satu) => (
                  <li key={satu.accountId} className="text-small text-foreground">
                    {emailByAccountId.get(satu.accountId) ?? satu.accountId}
                    {satu.accountId === accountIdSaya ? " (Anda)" : ""} — sejak {formatTanggalJam(satu.sejak)}, berakhir
                    sendiri {formatTanggalJam(satu.berakhirPada)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {sayaBertugas ? <TurunDariBertugasForm klaim={klaim} /> : <NyalakanBertugasForm />}
        </CardContent>
      </Card>
      {pesan ? (
        <p role={pesan.role} className="text-small text-muted-foreground">
          {pesan.text}
        </p>
      ) : null}
      <p className="flex items-center gap-2 text-caption text-muted-foreground">
        <BellRingIcon aria-hidden className="size-4" />
        Peringatan Staf Tier 1 dikirim ke perangkat push dan email. Kalau belum diambil dalam 30 menit, semua Admin
        Platform diberi tahu lagi. Tugas berakhir sendiri pukul 18.00 atau setelah 12 jam, mana yang lebih dulu.
      </p>
    </section>
  );
}
