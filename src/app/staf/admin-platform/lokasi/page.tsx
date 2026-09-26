import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOKASI_LIST_DEFAULT_PAGE_SIZE, LOKASI_MITRA_STATUSES, type LokasiMitraStatus } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { CreateLokasiForm } from "./lokasi-forms";
import { LokasiMitraTable } from "./lokasi-table";

/** A status typed in the URL, kept only when it names one; anything else means "every status". */
function parsedStatus(value: string | string[] | undefined): LokasiMitraStatus | undefined {
  const status = Array.isArray(value) ? value[0] : value;
  return (LOKASI_MITRA_STATUSES as readonly string[]).includes(status ?? "") ? (status as LokasiMitraStatus) : undefined;
}

function parsedPage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** Admin Platform: every Lokasi Mitra, searched and filtered by status, and the start of a new onboarding record. */
export default async function LokasiMitraListPage({ searchParams }: PageProps<"/staf/admin-platform/lokasi">) {
  const actor = await staffMenuActor("admin_platform");
  const query = await searchParams;
  const search = Array.isArray(query.q) ? query.q[0] : (query.q ?? "");
  const status = parsedStatus(query.status);
  const page = parsedPage(query.page);
  const result = await serverRuntime().lokasi.searchLokasiMitra(actor, {
    search,
    status,
    page,
    pageSize: LOKASI_LIST_DEFAULT_PAGE_SIZE,
  });

  return (
    <>
      <PageHeader title="Lokasi Mitra" description="Onboarding Lokasi Mitra dan undangan Admin Lokasi." />

      <Card>
        <CardHeader>
          <CardTitle>Lokasi Mitra baru</CardTitle>
          <CardDescription>
            Lokasi Mitra baru berstatus Belum Tayang. Lengkapi profil, perjanjian, rekening, kebijakan dan Admin Lokasi di
            halamannya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateLokasiForm />
        </CardContent>
      </Card>

      <LokasiMitraTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        search={search}
        status={status}
        isFiltering={search.trim() !== "" || status !== undefined}
      />
    </>
  );
}
