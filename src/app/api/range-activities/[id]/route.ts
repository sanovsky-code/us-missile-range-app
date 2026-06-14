import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/**
 * Endpoints for Excel-imported range activities (site_range_activities
 * table). Distinct from /api/activities/:id which operates on the
 * Salesforce-style site_timeline_activities. Naming the route segment
 * "range-activities" avoids the clash.
 */

/** GET /api/range-activities/:id */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const activity = store.getRangeActivity(id);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ activity });
}

/** PATCH /api/range-activities/:id — partial update. Logs every field
 * diff to activity_field_history. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateRangeActivity(id, body);
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
