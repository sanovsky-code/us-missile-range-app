import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

/** GET /api/systems/:id — fetch a single System by system_id (e.g. SYS-0137-001). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const system = store.getSystem(id);
  if (!system) return NextResponse.json({ error: "System not found" }, { status: 404 });
  return NextResponse.json({ system });
}

/** PATCH /api/systems/:id — partial update. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const store = getDataStore();
    await store.ensureLoaded();
    const updated = store.updateSystem(id, body);
    if (!updated) return NextResponse.json({ error: "System not found" }, { status: 404 });
    return NextResponse.json({ system: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update system";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/systems/:id. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getDataStore();
  await store.ensureLoaded();
  const ok = store.deleteSystem(id);
  if (!ok) return NextResponse.json({ error: "System not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
