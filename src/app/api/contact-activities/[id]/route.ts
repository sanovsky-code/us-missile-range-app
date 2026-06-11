import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { getDb } from "@/lib/db";
import type { TaskPriority, TaskStatus } from "@/lib/types";

/**
 * GET /api/contact-activities/:id
 * Returns the activity itself plus its history children (Task Update rows
 * that reference it via parent_activity_id, oldest first). Mirrors the
 * shape of GET /api/activities/:id so the Management page's TaskDetailModal
 * can talk to either endpoint based on the row's parent_type.
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
  const activity = store.getContactActivityById(activityId);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const history = getDb().prepare(
    `SELECT * FROM contact_timeline_activities
      WHERE parent_activity_id = ?
      ORDER BY datetime(created_at) ASC, id ASC`
  ).all(activityId);
  return NextResponse.json({ activity, history });
}


/** PATCH /api/contact-activities/:id — partial update. Status changes on
 * Tasks automatically insert a Task Update history row. */
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
    const updated = store.updateContactActivity(activityId, body);
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/contact-activities/:id — also removes Task Update children. */
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
  const ok = store.deleteContactActivity(activityId);
  if (!ok) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
