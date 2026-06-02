"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { SiteListItem, FilterState, FilterOptions } from "@/lib/types";
import FilterSidebar from "@/components/filters/FilterSidebar";
import { Loader2 } from "lucide-react";

const SiteMap = dynamic(() => import("@/components/map/SiteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  ),
});

const emptyFilters: FilterState = {
  search: "",
  countries: [],
  states: [],
  siteTypes: [],
  sizeCategories: [],
  activityTypes: [],
  confidenceLevels: [],
  specializations: [],
};

const emptyOptions: FilterOptions = {
  countries: [],
  states: [],
  siteTypes: [],
  sizeCategories: [],
  activityTypes: [],
  confidenceLevels: [],
  specializations: [],
};

export default function MapPage() {
  const [allSites, setAllSites] = useState<SiteListItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyOptions);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sites")
      .then((res) => res.json())
      .then((data) => {
        setAllSites(data.sites);
        setFilterOptions(data.filterOptions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredSites = useMemo(() => {
    let sites = allSites;
    const { search, countries, states, siteTypes, sizeCategories, confidenceLevels, specializations } = filters;

    if (search) {
      const q = search.toLowerCase();
      sites = sites.filter(
        (s) =>
          s.site_name.toLowerCase().includes(q) ||
          (s.country?.toLowerCase().includes(q) ?? false) ||
          s.state.toLowerCase().includes(q) ||
          s.managing_organization.toLowerCase().includes(q) ||
          (s.operator?.toLowerCase().includes(q) ?? false)
      );
    }
    if (countries.length > 0) sites = sites.filter((s) => countries.includes(s.country));
    if (states.length > 0) sites = sites.filter((s) => states.includes(s.state));
    if (siteTypes.length > 0) sites = sites.filter((s) => siteTypes.includes(s.site_type));
    if (sizeCategories.length > 0) sites = sites.filter((s) => sizeCategories.includes(s.size_category));
    if (confidenceLevels.length > 0) sites = sites.filter((s) => confidenceLevels.includes(s.confidence_level));
    if (specializations && specializations.length > 0) {
      sites = sites.filter((s) =>
        specializations.some((spec) => (s.specializations || []).includes(spec))
      );
    }

    return sites;
  }, [allSites, filters]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <FilterSidebar
        filters={filters}
        filterOptions={filterOptions}
        totalCount={allSites.length}
        filteredCount={filteredSites.length}
        onFiltersChange={setFilters}
      />
      <div className="flex-1">
        <SiteMap sites={filteredSites} />
      </div>
    </div>
  );
}
