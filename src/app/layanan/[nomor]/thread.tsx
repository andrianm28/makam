import { DaftarPesanThread } from "@/components/layanan/thread-daftar";
import { FormPesanThread } from "@/components/layanan/thread-pesan";
import { serverRuntime } from "@/server/runtime";
import { kirimPesanThreadPemesan } from "./actions";

/** The thread of one job as its Pemesan reads and writes it (spec, Layanan > Message thread; stories 96, 171). */
export async function ThreadPemesan({ pekerjaanId, nomor, accountId, email }: { pekerjaanId: string; nomor: string; accountId: string; email: string }) {
  const hasil = await serverRuntime().layanan.bacaThreadPemesan({ accountId, email }, pekerjaanId);
  if (!hasil.ok) return null;
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label="Pesan untuk pekerjaan ini">
      <h3 className="text-body font-semibold">Pesan</h3>
      <DaftarPesanThread thread={hasil.thread} />
      {hasil.thread.tertutup ? null : <FormPesanThread pekerjaanId={pekerjaanId} action={kirimPesanThreadPemesan} hidden={{ nomor }} />}
    </section>
  );
}
