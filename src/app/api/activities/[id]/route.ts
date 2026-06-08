import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskPriority, TaskStatus } from "@/lib/types";
import { getDb } from "@/lib/db";

/**
 * GET /api/activities/:id
 * Returns the activity itself plus its history children (Task Update rows
 * that reference this activity via parent_activity_id, oldest first).
 * Used by the Management page's task detail modal.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const activity = store.getActivityById(activityId);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const history = getDb().prepare(
    `SELECT * FROM site_timeline_activities
      WHERE parent_activity_id = ?
      ORDER BY datetime(created_at) ASC, id ASC`
  ).all(activityId);
  return NextResponse.json({ activity, history });
}


/**
 * PATCH /api/activities/:id
 * Partial update. If the row is a Task and the status actually changes,
 * the data store ALSO inserts a "Task Update" history row that points
 * back at this activity via parent_activity_id.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as Partial<{
      subject: string;
      body: string;
      status: TaskStatus;
      priority: TaskPriority;
      due_date: string | null;
      assigned_to: string | null;
      created_by: string | null;
    }>;
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateActivity(activityId, body);
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/activities/:id — also removes Task Update children (cascade). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteActivity(activityId);
  if (!ok) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
