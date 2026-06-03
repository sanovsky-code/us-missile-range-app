import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskPriority, TaskStatus } from "@/lib/types";

/**
 * GET /api/activities
 * Powers the Management tab. Defaults to active tasks (Open + In Progress)
 * across every site. Pass ?status=Done&status=Cancelled to include closed
 * ones, or ?site_id=SITE-0170 to scope.
 */
export async function GET(request: NextRequest) {
  const store = getDataStore();
  await store.ensureLoaded();
  const sp = request.nextUrl.searchParams;
  const statusParams = sp.getAll("status") as TaskStatus[];
  const tasks = store.listAllTaskActivities({
    status: statusParams.length > 0 ? statusParams : undefined,
    priority: sp.getAll("priority") as TaskPriority[],
    site_id: sp.get("site_id") ?? undefined,
  });
  return NextResponse.json({ tasks });
}
