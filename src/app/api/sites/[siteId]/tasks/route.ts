import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskPriority, TaskStatus } from "@/lib/types";

/** GET /api/sites/:siteId/tasks → tasks for the given site, open ones first. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  return NextResponse.json({ tasks: store.listTasksForSite(siteId) });
}

/** POST /api/sites/:siteId/tasks → create a new task linked to this site. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string;
      created_by?: string;
    };
    const store = getDataStore();
    await store.ensureLoaded();
    const task = store.createTask({
      site_id: siteId,
      title: body.title ?? "",
      description: body.description,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date,
      created_by: body.created_by,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
