import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskPriority, TaskStatus } from "@/lib/types";

/** GET /api/tasks → every task across every site, joined with site info. */
export async function GET(request: NextRequest) {
  const store = getDataStore();
  await store.ensureLoaded();
  const params = request.nextUrl.searchParams;
  const tasks = store.listAllTasks({
    status: params.getAll("status") as TaskStatus[],
    priority: params.getAll("priority") as TaskPriority[],
  });
  return NextResponse.json({ tasks });
}
