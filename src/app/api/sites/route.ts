import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { FilterState } from "@/lib/types";

export async function GET(request: NextRequest) {
  const store = getDataStore();
  await store.ensureLoaded();
  const params = request.nextUrl.searchParams;

  const filters: FilterState = {
    search: params.get("search") || "",
    countries: params.getAll("country"),
    states: params.getAll("state"),
    siteTypes: params.getAll("siteType"),
    sizeCategories: params.getAll("sizeCategory"),
    activityTypes: params.getAll("activityType"),
    confidenceLevels: params.getAll("confidenceLevel"),
    specializations: params.getAll("specialization"),
  };

  const sites = store.getAllSites(filters);
  const filterOptions = store.getFilterOptions();

  return NextResponse.json({ sites, filterOptions });
}
