import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  numeric?: boolean;
  sticky?: boolean; // first column stays visible on mobile horizontal scroll
  width?: string;
};

export function DataTable<T>({ rows, columns, rowKey, caption, empty = "沒有資料", initialSort }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; caption: string; empty?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const f = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined;
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort} style={{ width: c.width }}
                  className={cn("h-[36px] px-3 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap",
                    c.numeric ? "text-right" : "text-left", c.sticky && "sticky left-0 z-10 bg-surface")}>
                  {c.sortValue ? (
                    <button type="button" className={cn("inline-flex items-center gap-1 hover:text-text", active && "text-accent-text")}
                      onClick={() => setSort({ key: c.key, dir: active && sort!.dir === "desc" ? "asc" : "desc" })}>
                      {c.header}
                      {active && (sort!.dir === "desc" ? <ChevronDown className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />)}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-text-muted">{empty}</td></tr>
          ) : sorted.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border last:border-0 hover:bg-surface-raised">
              {columns.map((c) => (
                <td key={c.key} className={cn("h-[44px] px-3 whitespace-nowrap", c.numeric && "num text-right font-mono",
                  c.sticky && "sticky left-0 z-10 bg-surface")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
