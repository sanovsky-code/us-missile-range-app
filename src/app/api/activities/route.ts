import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskParentKind, TaskPriority, TaskStatus } from "@/lib/types";

/**
 * GET /api/activities
 * Powers the Management tab. Returns the UNIFIED task list across BOTH
 * site_timeline_activities AND contact_timeline_activities — every row
 * carries a `parent_type` discriminator so the UI can render the right
 * origin badge and link.
 *
 * Defaults to active tasks (Open + In Progress) across every parent.
 * Query params:
 *   ?status=Done&status=Cancelled   — include closed tasks
 *   ?priority=High                  — filter by priority
 *   ?parent_type=site|contact       — show only one origin
 *   ?parent_id=SITE-0170 (or "12")  — narrow to a single parent
 */
export async function GET(request: NextRequest) {
  const store = getDataStore();
  await store.ensureLoaded();
  const sp = request.nextUrl.searchParams;
  const statusParams = sp.getAll("status") as TaskStatus[];
  // Backwards-compat: the old API accepted ?site_id=… as a shortcut for
  // (parent_type=site, parent_id=…). Keep it working.
  const parentType = (sp.get("parent_type") as TaskParentKind | null) ?? (sp.get("site_id") ? "site" : undefined);
  const parentId = sp.get("parent_id") ?? sp.get("site_id") ?? undefined;
  const tasks = store.listAllTaskActivities({
    status: statusParams.length > 0 ? statusParams : undefined,
    priority: sp.getAll("priority") as TaskPriority[],
    parent_type: parentType ?? undefined,
    parent_id: parentId,
  });
  return NextResponse.json({ tasks });
}
