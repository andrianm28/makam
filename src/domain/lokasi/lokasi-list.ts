import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { semuaLokasiMitraResource, writeRefusal, type Actor } from "@/domain/identity";
import type { LokasiDeps, LokasiMitraStatus } from "./lokasi-mitra";
import { lokasiMitra as lokasiMitraTable } from "./schema";

/** The rows a page of the Lokasi Mitra list shows at most, and by default. */
export const LOKASI_LIST_MAX_PAGE_SIZE = 50;
export const LOKASI_LIST_DEFAULT_PAGE_SIZE = 10;

export interface LokasiMitraListQuery {
  /** A part of the name, kota / kabupaten or pengelola, any case. Blank finds all. */
  search?: string;
  /** Only Lokasi Mitra in this status. */
  status?: LokasiMitraStatus;
  /** 1-based; a page past the last one reads as the last page. */
  page?: number;
  pageSize?: number;
}

export interface LokasiMitraListRow {
  id: string;
  name: string;
  pengelolaName: string;
  city: string;
  status: LokasiMitraStatus;
}

export interface LokasiMitraListPage {
  rows: LokasiMitraListRow[];
  /** How many Lokasi Mitra match, across every page. */
  total: number;
  /** The page these rows are (1-based, clamped to the pages there are). */
  page: number;
  pageSize: number;
  /** How many pages the matches fill; at least 1. */
  pageCount: number;
}

/** `%` and `_` typed by a person are literal characters, not wildcards. */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * One page of the Lokasi Mitra list, by name, for Admin Platform (an empty page for anyone else):
 * searched by name, kota / kabupaten or pengelola, and filtered by status.
 */
export async function searchLokasiMitra(
  deps: LokasiDeps,
  by: Actor,
  query: LokasiMitraListQuery,
): Promise<LokasiMitraListPage> {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? LOKASI_LIST_DEFAULT_PAGE_SIZE), 1), LOKASI_LIST_MAX_PAGE_SIZE);
  if (writeRefusal(by, "lokasi.lihat_semua", semuaLokasiMitraResource())) {
    return { rows: [], total: 0, page: 1, pageSize, pageCount: 1 };
  }

  const conditions: SQL[] = [];
  const search = query.search?.trim();
  if (search) {
    const pattern = `%${literal(search)}%`;
    conditions.push(
      or(
        ilike(lokasiMitraTable.name, pattern),
        ilike(lokasiMitraTable.city, pattern),
        ilike(lokasiMitraTable.pengelolaName, pattern),
      )!,
    );
  }
  if (query.status) conditions.push(eq(lokasiMitraTable.status, query.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await deps.db.select({ total: count() }).from(lokasiMitraTable).where(where);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(query.page ?? 1), 1), pageCount);
  const rows = await deps.db
    .select({
      id: lokasiMitraTable.id,
      name: lokasiMitraTable.name,
      pengelolaName: lokasiMitraTable.pengelolaName,
      city: lokasiMitraTable.city,
      status: lokasiMitraTable.status,
    })
    .from(lokasiMitraTable)
    .where(where)
    .orderBy(asc(lokasiMitraTable.name), asc(lokasiMitraTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total, page, pageSize, pageCount };
}
