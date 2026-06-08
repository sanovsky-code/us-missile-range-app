"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ParsedRow } from "@/lib/excel-import";

interface Props {
  rows: ParsedRow[];
  columns: { field: string; label: string }[];
  /** Field names that contribute to the free-text search box. */
  searchFields: string[];
  /** Selected keys from the parent. */
  selectedKeys: Set<string>;
  onToggle: (key: string, isOn: boolean) => void;
  onSelectAll: (visibleKeys: string[]) => void;
  onClearAll: () => void;
}

export default function SelectRecordsTable({
  rows,
  columns,
  searchFields,
  selectedKeys,
  onToggle,
  onSelectAll,
  onClearAll,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      searchFields.some((f) => (r.cells[f] ?? "").toLowerCase().includes(q))
    );
  }, [rows, query, searchFields]);

  const visibleKeys = filtered.map((r) => r.key).filter((k) => k !== "");
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-200">
        <div className="flex-1 max-w-sm relative">
          <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש..."
            className="w-full pr-8 pl-3 py-2 border border-gray-200 rounded-md text-sm"
            dir="rtl"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            נבחרו: <strong className="text-blue-700">{selectedKeys.size}</strong> / מוצגים: {filtered.length} (סה&quot;כ: {rows.length})
          </span>
          <button
            type="button"
            onClick={() => onSelectAll(visibleKeys)}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            בחר הכל (מסונן)
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
          >
            נקה בחירה
          </button>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-right border-b border-gray-200 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => (e.target.checked ? onSelectAll(visibleKeys) : onClearAll())}
                  aria-label="בחר הכל"
                />
              </th>
              {columns.map((c) => (
                <th key={c.field} className="px-3 py-2 text-right border-b border-gray-200 font-medium text-gray-700">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-gray-500">
                  אין רשומות להצגה
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const isSelected = selectedKeys.has(row.key);
              return (
                <tr
                  key={`${row.rowNumber}-${row.key}`}
                  className={
                    "border-b border-gray-100 cursor-pointer " +
                    (isSelected ? "bg-blue-50/40" : "hover:bg-gray-50")
                  }
                  onClick={() => row.key && onToggle(row.key, !isSelected)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!row.key}
                      onChange={(e) => row.key && onToggle(row.key, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c.field} className="px-3 py-2 text-gray-700 max-w-xs truncate" title={row.cells[c.field] ?? ""}>
                      {row.cells[c.field] ?? ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
