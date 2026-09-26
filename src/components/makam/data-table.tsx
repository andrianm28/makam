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
  density = "comfortable",
  empty,
  caption,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder: string;
  filter?: { columnId: string; label: string; allLabel: string; options: { value: string; label: string }[] };
  rowActions?: (row: TData) => RowAction<TData>[];
  pageSize?: number;
  density?: Density;
  /** Shown when there are no rows at all (not when a search finds none). */
  empty?: React.ReactNode;
  caption: string;
}) {
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
    state: { globalFilter, columnFilters, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    globalFilterFn: "includesString",
  });

  if (data.length === 0 && empty) return <>{empty}</>;

  const filtered = table.getFilteredRowModel().rows.length;
  const filterValue = (columnFilters.find((item) => item.id === filter?.columnId)?.value as string | undefined) ?? "";
  const first = pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(filtered, first + pagination.pageSize - 1);

  return (
    <div data-slot="data-table" data-density={density} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={globalFilter}
            onChange={(event) => {
              setGlobalFilter(event.target.value);
              setPagination((page) => ({ ...page, pageIndex: 0 }));
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
              setColumnFilters(next ? [{ id: filter.columnId, value: next }] : []);
              setPagination((page) => ({ ...page, pageIndex: 0 }));
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
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
        {filtered === 0 ? (
          <EmptyState
            icon={SearchXIcon}
            title="Tidak ada yang cocok"
            description="Ubah kata pencarian atau filter."
            className="rounded-none border-0"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setGlobalFilter("");
                  setColumnFilters([]);
                }}
              >
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
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeftIcon />
            </Button>
            <span className="px-2 tabular-nums">
              Halaman {pagination.pageIndex + 1} dari {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
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
