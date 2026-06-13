import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/lifecycle-events/:id — fetch a single radar lifecycle event. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const event = store.getLifecycleEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ event });
}

/** PATCH /api/lifecycle-events/:id — partial update. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateLifecycleEvent(id, body);
    if (!updated) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    return NextResponse.json({ event: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update event";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/lifecycle-events/:id. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteLifecycleEvent(id);
  if (!ok) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
