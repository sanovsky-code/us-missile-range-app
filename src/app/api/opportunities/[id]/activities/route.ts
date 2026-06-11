import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import type { OpportunityActivityType, TaskPriority, TaskStatus } from "@/lib/types";

/** GET /api/opportunities/:id/activities[?type=Comment|Task|Call|Event|...] */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const oppId = Number(id);
  if (!Number.isFinite(oppId)) {
    return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
  }
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ activities: store.listOpportunityActivities(oppId, type) });
}

/**
 * POST /api/opportunities/:id/activities
 * Body: { activity_type: "Comment"|"Task"|"Call"|"Event", subject, body?,
 *         status?, priority?, due_date?, assigned_to?,
 *         start_at?, end_at?, location?, attendees?, created_by? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const oppId = Number(id);
  if (!Number.isFinite(oppId)) {
    return NextResponse.json({ error: "Invalid opportunity id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      activity_type?: OpportunityActivityType;
      subject?: string;
      body?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string;
      assigned_to?: string;
      start_at?: string;
      end_at?: string;
      location?: string;
      attendees?: string;
      created_by?: string;
      parent_activity_id?: number;
    };
    if (!body.activity_type) {
      return NextResponse.json({ error: "activity_type is required" }, { status: 400 });
    }
    const store = getDataStore();
    await store.ensureLoaded();
    const activity = store.createOpportunityActivity({
      opportunity_id: oppId,
      activity_type: body.activity_type,
      subject: body.subject ?? "",
      body: body.body,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date,
      assigned_to: body.assigned_to,
      start_at: body.start_at,
      end_at: body.end_at,
      location: body.location,
      attendees: body.attendees,
      created_by: body.created_by,
      parent_activity_id: body.parent_activity_id,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
