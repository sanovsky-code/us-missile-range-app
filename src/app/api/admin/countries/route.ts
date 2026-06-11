import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/**
 * GET /api/admin/countries
 * Returns every country present in the sites table with totals (total
 * sites, hidden sites, visible sites) and the country-level hide flag.
 * Powers the /admin/countries page.
 */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ countries: store.listAllCountriesWithCounts() });
}
