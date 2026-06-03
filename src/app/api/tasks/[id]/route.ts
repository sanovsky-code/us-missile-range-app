import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { TaskPriority, TaskStatus } from "@/lib/types";

/** PATCH /api/tasks/:id → partial update. Only the supplied fields change. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      due_date: string | null;
    }>;
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateTask(taskId, body);
    if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ task: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/tasks/:id → remove a task. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteTask(taskId);
  if (!ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
