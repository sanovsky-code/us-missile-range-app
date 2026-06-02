"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
import { FilterState, FilterOptions } from "@/lib/types";
import FilterSelect from "./FilterSelect";

interface FilterSidebarProps {
  filters: FilterState;
  filterOptions: FilterOptions;
  totalCount: number;
  filteredCount: number;
  onFiltersChange: (filters: FilterState) => void;
}

export default function FilterSidebar({
  filters,
  filterOptions,
  totalCount,
  filteredCount,
  onFiltersChange,
}: FilterSidebarProps) {
  const hasActiveFilters =
    filters.search ||
    (filters.countries?.length ?? 0) > 0 ||
    filters.states.length > 0 ||
    filters.siteTypes.length > 0 ||
    filters.sizeCategories.length > 0 ||
    filters.activityTypes.length > 0 ||
    filters.confidenceLevels.length > 0 ||
    (filters.specializations?.length ?? 0) > 0;

  const clearAll = () => {
    onFiltersChange({
      search: "",
      countries: [],
      states: [],
      siteTypes: [],
      sizeCategories: [],
      activityTypes: [],
      confidenceLevels: [],
      specializations: [],
    });
  };

  const specializationHebrew: Record<string, string> = {
    "Ballistic Missile Tracking": "בקרת ומעקב טילים בליסטיים",
    "Satellite Launch Tracking": "מעקב שיגורי לוויינים",
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-800">סינון</h2>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              נקה הכל
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש אתרים, מכ&quot;מים, מפעילים..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="w-full pr-9 pl-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {filters.search && (
            <button
              onClick={() => onFiltersChange({ ...filters, search: "" })}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <FilterSelect
          label="התמחות"
          options={filterOptions.specializations || []}
          selected={filters.specializations || []}
          onChange={(specializations) => onFiltersChange({ ...filters, specializations })}
          labelFor={(v) => specializationHebrew[v] || v}
        />
        <FilterSelect
          label="מדינה (Country)"
          options={filterOptions.countries || []}
          selected={filters.countries || []}
          onChange={(countries) => onFiltersChange({ ...filters, countries })}
        />
        <FilterSelect
          label="מדינה / חבל ארץ"
          options={filterOptions.states}
          selected={filters.states}
          onChange={(states) => onFiltersChange({ ...filters, states })}
        />
        <FilterSelect
          label="סוג אתר"
          options={filterOptions.siteTypes}
          selected={filters.siteTypes}
          onChange={(siteTypes) => onFiltersChange({ ...filters, siteTypes })}
        />
        <FilterSelect
          label="קטגוריית גודל"
          options={filterOptions.sizeCategories}
          selected={filters.sizeCategories}
          onChange={(sizeCategories) => onFiltersChange({ ...filters, sizeCategories })}
        />
        <FilterSelect
          label="סוג פעילות"
          options={filterOptions.activityTypes}
          selected={filters.activityTypes}
          onChange={(activityTypes) => onFiltersChange({ ...filters, activityTypes })}
        />
        <FilterSelect
          label="רמת מהימנות"
          options={filterOptions.confidenceLevels}
          selected={filters.confidenceLevels}
          onChange={(confidenceLevels) => onFiltersChange({ ...filters, confidenceLevels })}
        />
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          מציג <span className="font-semibold text-gray-700">{filteredCount}</span> מתוך{" "}
          <span className="font-semibold text-gray-700">{totalCount}</span> אתרים
        </p>
      </div>
    </div>
  );
}
