"use client";

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./empty-state";

/** The table features every makam DataTable registers: search, one filter, pagination. */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof dataTableFeatures, TData>;

export interface RowAction<TData> {
  label: string;
  onSelect: (row: TData) => void;
  destructive?: boolean;
}

export type Density = "comfortable" | "compact";

export interface DataTableFilter {
  columnId: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
}

/**
 * Drives search, the status filter and pagination outside the table, e.g.
 * from the URL and a server-side query (`searchLokasiMitra`): `data` is
 * already the current page's rows. Without this the table filters and pages
 * `data` itself, client-side (a small, fully-loaded list, e.g. Tarif global's
 * version history).
 */
export interface DataTableManual {
  search: string;
  onSearchChange: (value: string) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  /** 1-based. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** How many rows a full page holds (the query's `pageSize`), for "X–Y dari Z". */
  pageSize: number;
  /** How many rows match, across every page. */
  total: number;
  /** True while a search or filter narrows the list, to tell "no matches" from "nothing at all". */
  isFiltering: boolean;
}

/**
 * The staff list pattern: search, one filter, pagination and a row action
 * menu over TanStack Table. Rows link to their detail page through the first
 * column; the action menu holds the secondary actions.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder,
  filter,
  rowActions,
  pageSize = 8,
  density: initialDensity = "comfortable",
  densityToggle = false,
  empty,
  caption,
  manual,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder: string;
  filter?: DataTableFilter;
  rowActions?: (row: TData) => RowAction<TData>[];
  pageSize?: number;
  density?: Density;
  /** Offer the Nyaman / Rapat switch. Only for dense admin tables. */
  densityToggle?: boolean;
  /** Shown when there are no rows at all (not when a search finds none). */
  empty?: React.ReactNode;
  caption: string;
  /** Search, filter and pagination driven by the caller instead of the table itself. */
  manual?: DataTableManual;
}) {
  const [density, setDensity] = useState<Density>(initialDensity);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const allColumns: DataTableColumn<TData>[] = rowActions
    ? [
        ...columns,
        {
          id: "aksi",
          header: () => <span className="sr-only">Aksi</span>,
          enableGlobalFilter: false,
          cell: ({ row }) => <RowActionsMenu row={row.original} actions={rowActions(row.original)} />,
        },
      ]
    : columns;

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data,
    state: manual
      ? { pagination: { pageIndex: manual.page - 1, pageSize: manual.pageSize } }
      : { globalFilter, columnFilters, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: manual ? (updater) => {
      const current = { pageIndex: manual.page - 1, pageSize: manual.pageSize };
      const next = typeof updater === "function" ? updater(current) : updater;
      manual.onPageChange(next.pageIndex + 1);
    } : setPagination,
    globalFilterFn: "includesString",
    manualPagination: manual !== undefined,
    ...(manual ? { pageCount: manual.pageCount } : {}),
  });

  if (data.length === 0 && !manual && empty) return <>{empty}</>;
  if (manual && data.length === 0 && !manual.isFiltering && empty) return <>{empty}</>;

  const filtered = manual ? manual.total : table.getFilteredRowModel().rows.length;
  const filterValue = manual
    ? (manual.filterValue ?? "")
    : ((columnFilters.find((item) => item.id === filter?.columnId)?.value as string | undefined) ?? "");
  const first = filtered === 0 ? 0 : manual ? (manual.page - 1) * manual.pageSize + 1 : pagination.pageIndex * pagination.pageSize + 1;
  const last = manual ? Math.min(manual.total, first + data.length - 1) : Math.min(filtered, first + pagination.pageSize - 1);
  const noMatches = manual ? manual.isFiltering && data.length === 0 : filtered === 0;

  const clearSearchAndFilter = () => {
    if (manual) {
      manual.onSearchChange("");
      manual.onFilterChange?.("");
      manual.onPageChange(1);
    } else {
      setGlobalFilter("");
      setColumnFilters([]);
    }
  };

  return (
    <div data-slot="data-table" data-density={density} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={manual ? manual.search : globalFilter}
            onChange={(event) => {
              if (manual) {
                manual.onSearchChange(event.target.value);
              } else {
                setGlobalFilter(event.target.value);
                setPagination((page) => ({ ...page, pageIndex: 0 }));
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {filter ? (
          <Select
            value={filterValue}
            onValueChange={(value) => {
              const next = String(value ?? "");
              if (manual) {
                manual.onFilterChange?.(next);
                manual.onPageChange(1);
              } else {
                setColumnFilters(next ? [{ id: filter.columnId, value: next }] : []);
                setPagination((page) => ({ ...page, pageIndex: 0 }));
              }
            }}
          >
            <SelectTrigger aria-label={filter.label} className="sm:w-48">
              <SelectValue>
                {(value: string) => filter.options.find((option) => option.value === value)?.label ?? filter.allLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{filter.allLabel}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {densityToggle ? <DensitySwitch value={density} onChange={setDensity} /> : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="bg-subtle">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="h-9 px-4 text-caption font-medium text-muted-foreground">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={cn(density === "compact" ? "h-(--row-height-compact)" : "h-(--row-height)")}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={cn("px-4", density === "compact" ? "py-1.5" : "py-3", cell.column.id === "aksi" && "w-12 pr-2 text-right")}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {noMatches ? (
          <EmptyState
            icon={SearchXIcon}
            title="Tidak ada yang cocok"
            description="Ubah kata pencarian atau filter."
            className="rounded-none border-0"
            action={
              <Button variant="outline" onClick={clearSearchAndFilter}>
                Hapus pencarian dan filter
              </Button>
            }
          />
        ) : null}
      </div>

      {filtered > 0 ? (
        <div className="flex items-center justify-between gap-4 text-small text-muted-foreground">
          <p className="tabular-nums" aria-live="polite">
            {first}–{last} dari {filtered}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => (manual ? manual.onPageChange(manual.page - 1) : table.previousPage())}
              disabled={manual ? manual.page <= 1 : !table.getCanPreviousPage()}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeftIcon />
            </Button>
            <span className="px-2 tabular-nums">
              Halaman {manual ? manual.page : pagination.pageIndex + 1} dari {manual ? Math.max(manual.pageCount, 1) : table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => (manual ? manual.onPageChange(manual.page + 1) : table.nextPage())}
              disabled={manual ? manual.page >= manual.pageCount : !table.getCanNextPage()}
              aria-label="Halaman berikutnya"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowActionsMenu<TData>({ row, actions }: { row: TData; actions: RowAction<TData>[] }) {
  const normal = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Aksi lain" />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {normal.map((action) => (
          <DropdownMenuItem key={action.label} onClick={() => action.onSelect(row)}>
            {action.label}
          </DropdownMenuItem>
        ))}
        {destructive.length > 0 && normal.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => (
          <DropdownMenuItem key={action.label} variant="destructive" onClick={() => action.onSelect(row)}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Comfortable by default; compact only where a table is dense. */
function DensitySwitch({ value, onChange }: { value: Density; onChange: (value: Density) => void }) {
  const options: { value: Density; label: string }[] = [
    { value: "comfortable", label: "Nyaman" },
    { value: "compact", label: "Rapat" },
  ];
  return (
    <div role="group" aria-label="Kepadatan tabel" className="flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5 sm:ml-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-md px-3 text-small text-muted-foreground outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option.value && "bg-card font-medium text-foreground shadow-xs",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The DataTable's own shape while its page is loading (a route's
 * `loading.tsx`): the same toolbar and row height, filled with skeletons, so
 * nothing jumps when the real rows arrive.
 */
export function DataTableSkeleton({
  columnCount,
  rowCount = 5,
  withFilter = false,
}: {
  columnCount: number;
  rowCount?: number;
  withFilter?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Skeleton className="h-9 sm:w-72" />
        {withFilter ? <Skeleton className="h-9 sm:w-48" /> : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="h-9 border-b border-border bg-subtle" />
        {Array.from({ length: rowCount }).map((_, row) => (
          <div key={row} className="flex h-(--row-height) items-center gap-4 border-b border-border px-4 last:border-b-0">
            {Array.from({ length: columnCount }).map((_, column) => (
              <Skeleton key={column} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
