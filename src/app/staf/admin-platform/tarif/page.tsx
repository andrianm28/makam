import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GLOBAL_TARIFF_KEYS, type GlobalTariffKey } from "@/domain/tariffs";
import { formatWib, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { formatRupiah, formatTanggal, globalTariffLabels } from "./format";
import { GlobalTariffForm } from "./tarif-forms";

const descriptions: Record<GlobalTariffKey, string> = {
  biaya_layanan_platform: "Biaya flat Operator, satu per Tagihan pesanan di Lokasi Mitra; ditampilkan terpisah dari tarif Lokasi Mitra.",
  biaya_pengurusan_pemakaman: "Biaya jasa Operator untuk Pengurusan di TPU DKI yang mengatur pemakaman.",
  biaya_pengurusan_berkas: "Biaya jasa Operator untuk Pengurusan yang hanya mengurus berkas (Pengurusan IPTM, Perpanjangan TPU).",
  retribusi_pemda_iptm: "Retribusi Pemda untuk IPTM, ditagih sesuai biaya dan disetor ke Pemda; Rp 0 bila Pemda tidak memungut.",
};

/** Admin Platform: the global tariffs, each a versioned price book. */
export default async function TarifGlobalPage() {
  await staffMenuActor("admin_platform");
  const { tariffs, adapters } = serverRuntime();
  const now = adapters.clock.now();
  const today = wibDateOf(now);
  const books = await Promise.all(
    GLOBAL_TARIFF_KEYS.map(async (key) => ({
      key,
      inForce: await tariffs.globalTariff(key, now),
      history: await tariffs.globalTariffHistory(key),
    })),
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/staf/admin-platform" className="text-sm underline underline-offset-4">
          Menu Admin Platform
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Tarif global</h1>
        <p className="text-sm text-muted-foreground">
          Setiap perubahan adalah versi baru dengan tanggal berlaku (boleh di masa depan). Versi lama tidak pernah diubah atau dihapus.
        </p>
      </div>
      {books.map(({ key, inForce, history }) => {
        const scheduled = history.filter((version) => version.inForceFrom > now);
        return (
          <section key={key} aria-labelledby={`tarif-${key}`}>
            <Card>
              <CardHeader>
                <CardTitle id={`tarif-${key}`}>{globalTariffLabels[key]}</CardTitle>
                <CardDescription>{descriptions[key]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <p data-testid={`berlaku-${key}`}>
                  {inForce
                    ? `Saat ini ${formatRupiah(inForce.amount)} · Harga berlaku sejak ${formatTanggal(inForce.effectiveOn)}`
                    : "Belum ada tarif yang berlaku."}
                </p>
                {scheduled.map((version) => (
                  <p key={version.seq}>
                    Harga baru mulai {formatTanggal(version.effectiveOn)}: {formatRupiah(version.amount)}
                  </p>
                ))}
                <GlobalTariffForm tariffKey={key} label={globalTariffLabels[key]} today={today} />
                {history.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer">Riwayat versi ({history.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {history.map((version) => (
                        <li key={version.seq}>
                          {formatRupiah(version.amount)} berlaku {formatTanggal(version.effectiveOn)} · dicatat {formatWib(version.enteredAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          </section>
        );
      })}
    </>
  );
}
