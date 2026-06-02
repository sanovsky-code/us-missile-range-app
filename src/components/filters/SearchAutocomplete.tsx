"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, MapPin } from "lucide-react";
import { SiteListItem } from "@/lib/types";
import { SIZE_CATEGORY_COLORS } from "@/lib/constants";

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  sites: SiteListItem[];
  onSelectSite?: (site: SiteListItem) => void;
  maxSuggestions?: number;
}

export default function SearchAutocomplete({
  value, onChange, sites, onSelectSite, maxSuggestions = 12,
}: SearchAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [] as SiteListItem[];
    const matches = sites.filter((s) => {
      return (
        s.site_name.toLowerCase().includes(q) ||
        (s.country?.toLowerCase().includes(q) ?? false) ||
        s.state.toLowerCase().includes(q) ||
        s.managing_organization.toLowerCase().includes(q) ||
        (s.operator?.toLowerCase().includes(q) ?? false)
      );
    });

    // Rank: name startsWith > name contains > everything else
    matches.sort((a, b) => {
      const aName = a.site_name.toLowerCase();
      const bName = b.site_name.toLowerCase();
      const aStarts = aName.startsWith(q) ? 0 : aName.includes(q) ? 1 : 2;
      const bStarts = bName.startsWith(q) ? 0 : bName.includes(q) ? 1 : 2;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return aName.localeCompare(bName);
    });

    return matches.slice(0, maxSuggestions);
  }, [value, sites, maxSuggestions]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showDropdown = focused && value.trim().length > 0 && suggestions.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((idx) => (idx + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((idx) => (idx <= 0 ? suggestions.length - 1 : idx - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = activeIdx >= 0 ? suggestions[activeIdx] : suggestions[0];
      if (pick) {
        handleSelect(pick);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const handleSelect = (site: SiteListItem) => {
    onSelectSite?.(site);
    setFocused(false);
    inputRef.current?.blur();
  };

  // Highlight matching substring in a name
  const renderHighlight = (text: string, q: string) => {
    if (!q) return text;
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    const idx = lower.indexOf(lq);
    if (idx < 0) return text;
    return (
      <>
        {text.substring(0, idx)}
        <span className="bg-yellow-200 font-semibold text-gray-900 rounded px-0.5">
          {text.substring(idx, idx + lq.length)}
        </span>
        {text.substring(idx + lq.length)}
      </>
    );
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="חיפוש אתרים, מכ&quot;מים, מפעילים..."
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        className="w-full pr-9 pl-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {showDropdown && (
        <ul
          className="absolute z-[1100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-auto"
          role="listbox"
        >
          {suggestions.map((site, i) => {
            const color = SIZE_CATEGORY_COLORS[site.size_category] || "#6b7280";
            const isActive = i === activeIdx;
            return (
              <li
                key={site.site_id}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(site);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-3 py-2 cursor-pointer text-sm border-b border-gray-50 last:border-b-0 ${
                  isActive ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate" dir="ltr" style={{ textAlign: "left" }}>
                      {renderHighlight(site.site_name, value)}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500" dir="ltr" style={{ textAlign: "left" }}>
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span>{site.country}</span>
                      {site.state && <span>· {site.state}</span>}
                      <span className="text-gray-400">·</span>
                      <span>{site.site_type}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {suggestions.length === maxSuggestions && (
            <li className="px-3 py-2 text-[11px] text-center text-gray-400 bg-gray-50">
              מציג {maxSuggestions} תוצאות ראשונות – צמצם את החיפוש לעוד תוצאות
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
