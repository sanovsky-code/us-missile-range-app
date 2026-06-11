"use client";

/**
 * Salesforce-style lookup input.
 *
 * Replaces a `<select>` when the option list is too long for a dropdown
 * (sites, sources). The user types a few characters, sees ranked matches,
 * and clicks (or Enter-keys) to select. ↑/↓ navigate, Esc closes, ✕
 * clears the selection.
 *
 * Generic over the option type T. The caller provides:
 *   - options:   the FULL list (we fetch it once and filter client-side;
 *                cheap for the ~hundreds of sites/sources this app has).
 *   - getKey(o): the value that gets bound to the form field.
 *   - filter(o, q): predicate that decides if option `o` matches query `q`.
 *   - renderRow(o):  what each match row looks like in the dropdown.
 *   - renderChip(o): how the selected value is shown when collapsed.
 *
 * The component never owns the value — it's controlled by `value` /
 * `onChange` so the parent form can decide what to persist.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown, Loader2 } from "lucide-react";

interface Props<T> {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  options: T[] | null;          // null = still loading
  /** Convert an option into the string we store in form state. */
  getKey: (o: T) => string;
  /** Case-insensitive match predicate. */
  filter: (o: T, query: string) => boolean;
  /** Rendered for each row in the open dropdown. */
  renderRow: (o: T) => React.ReactNode;
  /** Rendered when an option is selected and the input is closed. */
  renderChip: (o: T) => React.ReactNode;
  placeholder?: string;
  maxResults?: number;
  /** Optional dir attr for the visible input (LTR for IDs/URLs). */
  inputDir?: "ltr" | "rtl" | "auto";
}

export default function LookupField<T>({
  value, onChange, options, getKey, filter, renderRow, renderChip,
  placeholder, maxResults = 12, inputDir,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the currently-selected option from value, when available.
  const selected = useMemo(() => {
    if (!value || !options) return null;
    return options.find((o) => getKey(o) === value) ?? null;
  }, [value, options, getKey]);

  // Filtered matches.
  const matches = useMemo(() => {
    if (!options) return [];
    const q = query.trim();
    if (!q) return options.slice(0, maxResults);
    return options.filter((o) => filter(o, q)).slice(0, maxResults);
  }, [options, query, filter, maxResults]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Reset highlight when results change.
  useEffect(() => { setHighlight(0); }, [query, matches.length]);

  const select = (o: T) => {
    onChange(getKey(o));
    setQuery("");
    setOpen(false);
    // Give focus back to the input so subsequent keyboard input clears the
    // selection cleanly via Backspace.
    inputRef.current?.blur();
  };

  const clear = () => {
    onChange(null);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((i) => Math.min(i + 1, Math.max(matches.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[highlight]) select(matches[highlight]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Collapsed selection chip */}
      {selected && !open ? (
        <div className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded bg-white">
          <button
            type="button"
            onClick={() => { setOpen(true); setQuery(""); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="flex-1 text-right text-sm text-gray-900 truncate"
          >
            {renderChip(selected)}
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-gray-400 hover:text-red-600 p-0.5 rounded"
            title="נקה בחירה"
            aria-label="נקה"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        // Search input
        <div className="relative">
          <Search className="w-4 h-4 absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder ?? "חפש..."}
            className="w-full pr-8 pl-7 py-1.5 text-sm border border-gray-200 rounded"
            dir={inputDir}
          />
          <ChevronDown
            className="w-4 h-4 absolute left-2 top-2.5 text-gray-400 pointer-events-none"
          />
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {options === null ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin inline-block ml-1" /> טוען...
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              לא נמצאו התאמות.
            </div>
          ) : (
            <ul role="listbox">
              {matches.map((o, i) => (
                <li
                  key={getKey(o)}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); select(o); }}
                  className={
                    "px-3 py-2 text-sm cursor-pointer " +
                    (i === highlight ? "bg-blue-50 text-blue-900" : "hover:bg-gray-50 text-gray-900")
                  }
                >
                  {renderRow(o)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
