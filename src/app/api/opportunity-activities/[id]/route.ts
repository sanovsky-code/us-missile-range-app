import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { getDb } from "@/lib/db";
import type { TaskPriority, TaskStatus } from "@/lib/types";

/**
 * GET /api/opportunity-activities/:id
 * Returns the activity plus its history children (Task Update rows pointing
 * to it via parent_activity_id, oldest first). Mirrors the contact-activities
 * endpoint so a future unified TaskDetailModal can reuse the shape.
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
  const activity = store.getOpportunityActivity(activityId);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const history = getDb().prepare(
    `SELECT * FROM opportunity_timeline_activities
      WHERE parent_activity_id = ?
      ORDER BY datetime(created_at) ASC, id ASC`
  ).all(activityId);
  return NextResponse.json({ activity, history });
}

/** PATCH /api/opportunity-activities/:id — partial update. Status changes on
 * Tasks auto-insert a Task Update history row. */
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
      start_at: string | null;
      end_at: string | null;
      location: string | null;
      attendees: string | null;
      created_by: string | null;
    }>;
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateOpportunityActivity(activityId, body);
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/opportunity-activities/:id — also removes Task Update children. */
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
  const ok = store.deleteOpportunityActivity(activityId);
  if (!ok) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
