import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/sites/:siteId/systems → list every System row for this Site. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ systems: store.listSystemsForSite(siteId) });
}

/** POST /api/sites/:siteId/systems — create a new System under this Site.
 * Body: { system_name, system_category, ...all other System fields, created_by? }
 * system_id is auto-generated as SYS-<site-numeric-suffix>-NNN if omitted. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const system = store.createSystem({
      site_id: siteId,
      system_id: body.system_id,
      system_name: body.system_name,
      system_category: body.system_category,
      purpose: body.purpose,
      owner: body.owner,
      operator: body.operator,
      manufacturer: body.manufacturer,
      operational_status: body.operational_status,
      public_description: body.public_description,
      citations: body.citations,
      confidence_level: body.confidence_level,
      last_verified_date: body.last_verified_date,
      source_id: body.source_id,
      record_status: body.record_status,
      created_by: body.created_by,
    });
    return NextResponse.json({ system }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create system";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
