import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AntreanRow, AntreanTier, BertugasStatus } from "@/domain/queues";
import { formatTanggalJam, wibTime } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { AntreanRowCard } from "./antrean-row-card";
import { AktifkanBertugasForm, MatikanBertugasForm } from "./bertugas-forms";

const TIERS: AntreanTier[] = [1, 2, 3, 4];
const tierLabels: Record<AntreanTier, string> = {
  1: "Tier 1 — urgent",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
};

/**
 * Admin Platform's Antrean (spec, Work Queues; ticket 17): every open row,
 * grouped by tier then sorted by deadline, the counter strip, Ambil and
 * Catatan Internal (ticket 17), and at the top who is Bertugas now with the
 * signed-in Admin Platform's own switch (ticket 28). The red banner for untaken
 * Tier 1 rows is in the staff header, on every staff page.
 */
export default async function AntreanPage() {
  const actor = await staffMenuActor("admin_platform");
  const { queues, identity } = serverRuntime();
  const [rows, counters, staffAccounts, bertugas] = await Promise.all([
    queues.antrean(actor),
    queues.counters(actor),
    identity.staffAccounts(),
    queues.bertugas(actor),
  ]);
  const emailByAccountId = new Map(staffAccounts.map((account) => [account.accountId, account.email ?? account.accountId]));

  const byTier = new Map<AntreanTier, AntreanRow[]>();
  for (const row of rows) byTier.set(row.tier, [...(byTier.get(row.tier) ?? []), row]);

  return (
    <>
      <PageHeader
        title="Antrean"
        description="Setiap baris kerja terbuka dari Lokasi Mitra, Tugas Lapangan, Tagihan dan Pencairan, per tier lalu tenggat. Baris menutup diri sendiri begitu keadaannya berubah."
        actions={
          // The Penilaian of every finished job: read here and nowhere else, so it is one step from the Antrean.
          <Link href="/staf/admin-platform/penilaian" className={buttonVariants({ variant: "outline" })}>
            Penilaian pemesan
          </Link>
        }
      />

      {bertugas ? (
        <BertugasPanel
          status={bertugas}
          dipegang={rows.filter((row) => row.ambil?.accountId === actor.accountId)}
        />
      ) : null}

      <section aria-label="Ringkasan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Pencairan jatuh tempo" value={counters.pencairanDue} />
        <StatCard label="Tagihan lewat jatuh tempo" value={counters.tagihanOverdue} />
        <StatCard label="Pekerjaan Terlambat" value={counters.terlambatJobs} />
        <StatCard label="Keluhan terbuka" value={counters.keluhanOpen} />
        <StatCard
          label="Baris lewat tenggat"
          value={counters.pastDeadline}
          attention={counters.pastDeadline > 0 ? "danger" : undefined}
        />
      </section>

      {rows.length === 0 ? (
        <EmptyState icon={InboxIcon} title="Antrean kosong" description="Tidak ada baris kerja terbuka saat ini." />
      ) : (
        TIERS.map((tier) => {
          const tierRows = byTier.get(tier);
          if (!tierRows || tierRows.length === 0) return null;
          return (
            <section key={tier} aria-label={tierLabels[tier]} className="flex flex-col gap-3">
              <h2 className="text-title-2 text-foreground">{tierLabels[tier]}</h2>
              <div className="flex flex-col gap-3">
                {tierRows.map((row) => (
                  <AntreanRowCard key={`${row.type}:${row.subjectId}`} row={row} emailByAccountId={emailByAccountId} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

/** Who is Bertugas now (top of the Antrean, spec story 142) and the signed-in Admin Platform's own switch. */
function BertugasPanel({ status, dipegang }: { status: BertugasStatus; dipegang: AntreanRow[] }) {
  const { sekarang, saya } = status;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-2 text-foreground">Bertugas sekarang</h2>
          {sekarang.length === 0 ? (
            <p className="text-small text-muted-foreground">
              Tidak ada yang Bertugas. Peringatan Tier 1 dikirim ke semua Admin Platform.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-body text-foreground">
              {sekarang.map((akun) => (
                <li key={akun.accountId}>
                  {akun.name}
                  <span className="text-small text-muted-foreground"> · sejak {wibTime(akun.mulaiAt)}, berakhir otomatis {wibTime(akun.berakhirAt)} WIB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {saya.bertugas ? (
          <MatikanBertugasForm
            baris={dipegang.map((row) => ({ type: row.type, subjectId: row.subjectId, label: row.label, subjectLabel: row.subjectLabel }))}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {saya.dimatikanOtomatisAt ? (
              <p className="text-small text-muted-foreground">
                Bertugas Anda mati otomatis {formatTanggalJam(saya.dimatikanOtomatisAt)}. Baris yang Anda ambil dan catatan Anda tetap ada.
              </p>
            ) : null}
            {saya.perangkatPush === 0 ? (
              <p className="text-small text-muted-foreground">
                Bertugas perlu push aktif di sedikitnya satu perangkat Anda. Nyalakan push lewat panel di atas halaman lebih dulu.
              </p>
            ) : null}
            <AktifkanBertugasForm />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
