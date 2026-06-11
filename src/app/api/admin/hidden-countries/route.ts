import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/admin/hidden-countries — list current hide entries. */
export async function GET() {
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ countries: store.listHiddenCountries() });
}

/**
 * POST /api/admin/hidden-countries
 * Body: { country: string, hidden_by?: string }
 * Idempotent — re-adding a hidden country is a 200 no-op.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { country?: string; hidden_by?: string };
    if (!body.country || !body.country.trim()) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
    }
    const store = getDataStore();
    await store.ensureLoaded();
    const inserted = store.addHiddenCountry(body.country.trim(), body.hidden_by);
    return NextResponse.json({ country: body.country.trim(), hidden: true, inserted }, { status: inserted ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to hide country";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
