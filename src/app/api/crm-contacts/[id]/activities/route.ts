import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import type { TaskPriority, TaskStatus } from "@/lib/types";

/** GET /api/crm-contacts/:id/activities[?type=Comment|Task|Call|...] */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  const type = request.nextUrl.searchParams.get("type") || undefined;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ activities: store.listActivitiesForContact(contactId, type) });
}

/**
 * POST /api/crm-contacts/:id/activities
 * Body: { activity_type, subject, body?, status?, priority?, due_date?,
 *         assigned_to?, created_by?, parent_activity_id? }
 *
 * activity_type is typically "Comment", "Task", or "Call". A status change
 * on an existing Task is handled via PATCH /api/contact-activities/:id and
 * automatically inserts a Task Update row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      activity_type?: string;
      subject?: string;
      body?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string;
      assigned_to?: string;
      created_by?: string;
      parent_activity_id?: number;
    };
    if (!body.activity_type) {
      return NextResponse.json({ error: "activity_type is required" }, { status: 400 });
    }
    const store = getDataStore();
    await store.ensureLoaded();
    const activity = store.createContactActivity({
      contact_id: contactId,
      activity_type: body.activity_type,
      subject: body.subject ?? "",
      body: body.body,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date,
      assigned_to: body.assigned_to,
      created_by: body.created_by,
      parent_activity_id: body.parent_activity_id,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create activity";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
