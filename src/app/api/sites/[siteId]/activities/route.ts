import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { ActivityType, TaskPriority, TaskStatus } from "@/lib/types";

/** GET /api/sites/:siteId/activities → newest-first list. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const type = request.nextUrl.searchParams.get("type") as ActivityType | null;
  return NextResponse.json({
    activities: store.listActivitiesForSite(siteId, type ?? undefined),
  });
}

/**
 * POST /api/sites/:siteId/activities
 * Body: { activity_type, subject, body?, status?, priority?, due_date?, assigned_to?, created_by? }
 * Creates a Comment, Task, or any other activity type.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = (await request.json()) as {
      activity_type?: ActivityType;
      subject?: string;
      body?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string;
      assigned_to?: string;
      created_by?: string;
    };
    const store = getDataStore();
    await store.ensureLoaded();
    const activity = store.createActivity({
      site_id: siteId,
      activity_type: body.activity_type ?? "Comment",
      subject: body.subject ?? "",
      body: body.body,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date,
      assigned_to: body.assigned_to,
      created_by: body.created_by,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
