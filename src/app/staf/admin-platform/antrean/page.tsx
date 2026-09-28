import { InboxIcon } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { StatCard } from "@/components/makam/stat-card";
import type { AntreanRow, AntreanTier } from "@/domain/queues";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { AntreanRowCard } from "./antrean-row-card";
import { BertugasPanel } from "./bertugas-panel";

/** What the Bertugas actions left on the query, and what the panel says about it. */
const hasilBertugasSchema = z.object({ bertugas: z.enum(["ok", "tidak-ada-push", "tidak-berwenang"]).optional() });
const hasilBertugasPesan: Record<string, { role: "status" | "alert"; text: string }> = {
  ok: {
    role: "status",
    text: "Anda Bertugas sekarang. Peringatan Staf Tier 1 dikirim ke perangkat push dan ke email Anda.",
  },
  "tidak-ada-push": {
    role: "alert",
    text: "Belum bisa Bertugas: nyalakan dulu notifikasi push di perangkat ini lewat panel push di bagian atas halaman ini. Peringatan Staf hanya sampai ke perangkat push dan ke email.",
  },
  "tidak-berwenang": { role: "alert", text: "Hanya Admin Platform yang bisa Bertugas." },
};

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
 * Catatan Internal, and who is Bertugas now at the top (ticket 28).
 */
export default async function AntreanPage({ searchParams }: PageProps<"/staf/admin-platform/antrean">) {
  const actor = await staffMenuActor("admin_platform");
  const { queues, identity } = serverRuntime();
  const [query, rows, counters, petugas, staffAccounts] = await Promise.all([
    searchParams,
    queues.antrean(actor),
    queues.counters(actor),
    queues.petugasBertugas(actor),
    identity.staffAccounts(),
  ]);
  const hasil = hasilBertugasSchema.safeParse(await query).data?.bertugas;
  const pesanHasil = hasil ? hasilBertugasPesan[hasil] : undefined;
  const emailByAccountId = new Map(
    staffAccounts.map((account) => [account.accountId, account.email ?? account.accountId]),
  );

  const byTier = new Map<AntreanTier, AntreanRow[]>();
  for (const row of rows) byTier.set(row.tier, [...(byTier.get(row.tier) ?? []), row]);

  return (
    <>
      <PageHeader
        title="Antrean"
        description="Setiap baris kerja terbuka dari Lokasi Mitra, Tugas Lapangan, Tagihan dan Pencairan, per tier lalu tenggat. Baris menutup diri sendiri begitu keadaannya berubah."
      />

      <BertugasPanel
        petugas={petugas}
        accountIdSaya={actor.accountId}
        emailByAccountId={emailByAccountId}
        klaimSaya={rows.filter((row) => row.ambil?.accountId === actor.accountId)}
        pesan={pesanHasil}
      />

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
