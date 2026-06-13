import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/radars/:radarId/lifecycle → list every event for this Radar. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ radarId: string }> },
) {
  const { radarId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ events: store.listLifecycleEventsForRadar(radarId) });
}

/** POST /api/radars/:radarId/lifecycle — create a new lifecycle event.
 * Body: { event_type, ...other fields, created_by? }. event_id is
 * auto-generated as EVT-RAD-<site-suffix>-NNN if omitted. site_id is
 * resolved from the parent radar. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ radarId: string }> },
) {
  const { radarId } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const event = store.createLifecycleEvent({
      radar_id: radarId,
      event_id: body.event_id,
      event_type: body.event_type,
      event_date: body.event_date,
      event_year: body.event_year,
      event_title: body.event_title,
      event_description: body.event_description,
      authority_or_owner: body.authority_or_owner,
      supplier_or_contractor: body.supplier_or_contractor,
      disclosed_value: body.disclosed_value,
      currency: body.currency,
      value_scope: body.value_scope,
      evidence_status: body.evidence_status,
      source_ids: body.source_ids,
      analyst_note: body.analyst_note,
      created_by: body.created_by,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
